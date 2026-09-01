/*
 * The Sora 2 adapter.
 *
 * NOT synchronous, and that is the whole shape of it: a job runs for one to
 * five minutes, so `start` submits and returns, and the worker polls. An
 * adapter that held the result in memory could not be started in the web
 * process and polled in the worker.
 *
 * Sora exposes no idempotency key, so `reconcile` can only answer from THIS
 * process — the same limitation the images adapter documents. It separates
 * "never attempted here" (null, safe to start) from "attempted and the answer
 * was lost" (throws, never silently re-spent). That is also why media.generate
 * runs with retryLimit 0.
 */
import type { MediaAdapter } from "../adapter";
import { estimate } from "../cost";
import type { ModelDescriptor } from "../io";
import { MediaError, type GenerationSpec, type MediaJobHandle, type MediaJobState, type MediaJobStatus, type RawOutput } from "../types";
import { SORA_MODELS, SORA_SIZES } from "./models";
import { createJob, downloadVideo, readJob, type SoraConfig, type SoraJob } from "./transport";

/** Keys we sent to a vendor. Outlives the bytes, because spend outlives them. */
const attempted = new Set<string>();

/** Documented job states, mapped to ours. Anything unknown is treated as running. */
const STATUS: Record<string, MediaJobStatus> = {
  queued: "queued",
  preprocessing: "running",
  running: "running",
  processing: "running",
  in_progress: "running",
  succeeded: "succeeded",
  completed: "succeeded",
  failed: "failed",
  cancelled: "cancelled",
};

const config = (): SoraConfig | null => {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_VIDEO_DEPLOYMENT;
  const apiVersion = process.env.AZURE_OPENAI_VIDEO_API_VERSION;
  if (!endpoint || !apiKey || !deployment || !apiVersion) return null;
  return { endpoint, apiKey, deployment, apiVersion };
};

/** The size Azure accepts for this aspect, or a refusal naming what it does take. */
export function sizeFor(spec: GenerationSpec): string {
  const size = SORA_SIZES[spec.aspect ?? "9:16"];
  if (!size) throw new MediaError(`Sora 2 renders ${Object.keys(SORA_SIZES).join(" and ")} only.`, { category: "validation" });
  return size;
}

/**
 * The one reference image Sora takes, or none.
 *
 * PRODUCT WINS. A model that accepts a single reference and is handed a mood
 * board instead of the packshot produces a confident picture of the wrong
 * product, which is worse than no reference at all — so the priority is fixed
 * rather than "whatever the caller listed first" (lib/media/references.ts
 * applies the same order before it ever gets here).
 *
 * A reference resolved to a URL rather than bytes is skipped, not fetched:
 * this adapter does no IO of its own, and silently downloading a caller's URL
 * would move a trust boundary.
 */
export function referenceFor(spec: GenerationSpec): { bytes: Uint8Array; mimeType: string } | undefined {
  const usable = (spec.references ?? []).filter((r) => r.bytes && r.bytes.byteLength > 0);
  if (usable.length === 0) return undefined;
  const order = ["product", "logo", "talent", "style", "source", "driving"];
  const best = [...usable].sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role))[0];
  return { bytes: best.bytes!, mimeType: best.mimeType ?? "image/png" };
}

/** 6 seconds is a 400, not a rounded 8 — so refuse here rather than at the vendor. */
export function secondsFor(model: ModelDescriptor, spec: GenerationSpec): number {
  const allowed = model.io.outputs.duration?.allowed ?? [];
  const asked = spec.durationSeconds ?? allowed[0];
  if (!allowed.includes(asked)) {
    throw new MediaError(`Sora 2 renders ${allowed.join(", ")} second clips. ${asked} isn't one of them.`, { category: "validation" });
  }
  return asked;
}

/** The one place a vendor job becomes our state, shared by poll and reconcile. */
function stateFrom(job: SoraJob, handle: MediaJobHandle): MediaJobState {
  const status = STATUS[job.status ?? ""] ?? "running";
  const seconds = Number(job.seconds ?? 0);
  return {
    handle,
    // The video id IS the download id. There is no generations[] array, so a
    // succeeded job names exactly one output: itself.
    outputUrls: status === "succeeded" && job.id ? [job.id] : undefined,
    status,
    expiresAt: job.expires_at ? new Date(job.expires_at * 1000).toISOString() : undefined,
    error: status === "failed" ? new MediaError(job.error?.message ?? "The video job failed.", { category: "unknown" }) : undefined,
    /*
     * Per-second billing and no reported usage, so the quantity is the
     * duration the VENDOR echoes back rather than one we counted. Exact, but
     * only once the job succeeded; a failed job is not billed and must not
     * accrue against the ceiling.
     */
    usage: status === "succeeded" && seconds > 0 ? { quantity: seconds, unit: "video_seconds" } : undefined,
  };
}

export function soraAdapter(): MediaAdapter {
  return {
    key: "azure-sora",
    // Deliberately absent: see the header. Everything goes through the queue.
    models: () => SORA_MODELS,
    configured: () => config() !== null,
    estimate: (model, spec) => estimate(model, spec),

    async start(model, spec, idempotencyKey) {
      const c = config();
      if (!c) throw new MediaError("Video generation is not configured.", { category: "unconfigured" });
      const size = sizeFor(spec);
      const seconds = secondsFor(model, spec);
      const reference = referenceFor(spec);

      // Recorded BEFORE the call: if this throws, reconcile must know we tried.
      attempted.add(idempotencyKey);
      const job = await createJob(c, { prompt: spec.prompt, size, seconds, reference });
      if (!job.id) throw new MediaError("The video service accepted the job but returned no id.", { category: "unknown", ambiguous: true });

      return { adapter: "azure-sora", modelKey: model.key, remoteJobId: job.id, idempotencyKey };
    },

    async poll(handle) {
      const c = config();
      if (!c) throw new MediaError("Video generation is not configured.", { category: "unconfigured" });
      return stateFrom(await readJob(c, handle.remoteJobId), handle);
    },

    async fetch(state) {
      const c = config();
      if (!c) throw new MediaError("Video generation is not configured.", { category: "unconfigured" });
      const ids = state.outputUrls ?? [];
      if (ids.length === 0) throw new MediaError("The video job succeeded but named no output.", { category: "unknown" });
      const outputs: RawOutput[] = [];
      for (const id of ids) {
        outputs.push({ bytes: await downloadVideo(c, id), claimedMimeType: "video/mp4" });
      }
      return outputs;
    },

    async reconcile(idempotencyKey) {
      if (!attempted.has(idempotencyKey)) return null;
      throw new MediaError(
        "A video job was started for this request and its result was lost. Sora exposes no idempotency key, so it cannot be looked up — resolve it by hand before retrying.",
        { category: "unknown", ambiguous: true },
      );
    },
  };
}

export { SORA_MODELS } from "./models";
/** Tests only: forget what this process attempted. */
export const __resetSoraJobs = () => attempted.clear();
