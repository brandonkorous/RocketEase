/*
 * The fal.ai adapter — the breadth adapter (docs/media-generation.md §4):
 * one queue contract in front of many models, so adding a fal-hosted model is
 * a registry row in ./models.ts, never new plumbing.
 *
 * NOT synchronous: a Kling clip renders for minutes, so `start` submits and
 * the worker polls. fal returns per-request status/response URLs and its docs
 * say to use them rather than construct them — they ride in `handle.meta`,
 * which the platform persists (media_job.remote_meta) so a poll in another
 * process still has them. `meta` also carries the billed quantity, because
 * fal's response does not echo it and an unbilled success is the exact bug
 * docs/bugs/B-004 exists to prevent.
 *
 * fal exposes no idempotency key, so `reconcile` answers from THIS process,
 * the same way sora/ and openai/ do: null means "never attempted here, safe
 * to start"; attempted-but-lost throws rather than silently re-spending.
 */
import type { MediaAdapter } from "../adapter";
import { estimate } from "../cost";
import type { ModelDescriptor } from "../io";
import { MediaError, type CostUnit, type GenerationSpec, type MediaJobHandle, type MediaJobState, type RawOutput } from "../types";
import { FAL_MODELS } from "./models";
import { download, readResponse, readStatus, submit, type FalConfig } from "./transport";

/** Keys we sent to the vendor. Outlives the bytes, because spend outlives them. */
const attempted = new Set<string>();

/**
 * References are handed over as base64 data URIs: fal accepts them on any
 * `*_url` field (fal-cdn.md, 2026-09-01), and it keeps this adapter free of a
 * second vendor surface (their CDN upload API). Their docs warn the payload
 * inflates, so anything past this cap is refused with a reason instead of
 * discovering the gateway's limit at spend time. Raise it only after a real
 * reference actually hits it.
 */
export const MAX_REFERENCE_BYTES = 4 * 1024 * 1024;

/** The size preset fal's FLUX endpoint takes for each aspect we offer. */
export const FLUX_SIZES: Record<string, string> = {
  "1:1": "square_hd",
  "4:3": "landscape_4_3",
  "3:4": "portrait_4_3",
  "16:9": "landscape_16_9",
  "9:16": "portrait_16_9",
};

const config = (): FalConfig | null => {
  const key = process.env.FAL_KEY;
  return key ? { key } : null;
};

const need = (c: FalConfig | null): FalConfig => {
  if (!c) throw new MediaError("fal generation is not configured.", { category: "unconfigured" });
  return c;
};

const modelFor = (key: string): ModelDescriptor | null => FAL_MODELS.find((m) => m.key === key) ?? null;

/** 7 seconds is a 422, not a rounded 10 — refuse here rather than at the vendor. */
export function secondsFor(model: ModelDescriptor, spec: GenerationSpec): number {
  const allowed = model.io.outputs.duration?.allowed ?? [];
  const asked = spec.durationSeconds ?? allowed[0];
  if (!allowed.includes(asked)) {
    throw new MediaError(`${model.label} renders ${allowed.join(" or ")} second clips. ${asked} isn't one of them.`, { category: "validation" });
  }
  return asked;
}

export function aspectFor(model: ModelDescriptor, spec: GenerationSpec): string {
  const aspects = model.io.outputs.aspects;
  const asked = spec.aspect ?? aspects[0];
  if (!aspects.includes(asked)) {
    throw new MediaError(`${model.label} renders ${aspects.join(", ")} only.`, { category: "validation" });
  }
  return asked;
}

/** The one reference as a data URI. PRODUCT WINS — same fixed order as sora/. */
export function referenceDataUri(spec: GenerationSpec): string | null {
  const usable = (spec.references ?? []).filter((r) => r.bytes && r.bytes.byteLength > 0);
  if (usable.length === 0) return null;
  const order = ["product", "logo", "talent", "style", "source", "driving"];
  const best = [...usable].sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role))[0];
  if (best.bytes!.byteLength > MAX_REFERENCE_BYTES) {
    throw new MediaError("The reference image is too large to send inline — use a smaller one.", { category: "validation" });
  }
  return `data:${best.mimeType ?? "image/png"};base64,${Buffer.from(best.bytes!).toString("base64")}`;
}

/** The vendor body for each row. Field names are the pages', verbatim. */
export function inputFor(model: ModelDescriptor, spec: GenerationSpec): Record<string, unknown> {
  const negative = spec.negativePrompt ? { negative_prompt: spec.negativePrompt } : {};
  if (model.key === "fal-kling-25-pro-i2v") {
    aspectFor(model, spec); // the input image decides the frame, but an unservable ask still refuses early
    const image = referenceDataUri(spec);
    if (!image) throw new MediaError("Image-to-video needs a reference image, and none was provided.", { category: "validation" });
    return { prompt: spec.prompt, image_url: image, duration: String(secondsFor(model, spec)), ...negative };
  }
  if (model.key === "fal-kling-25-pro-t2v") {
    return { prompt: spec.prompt, duration: String(secondsFor(model, spec)), aspect_ratio: aspectFor(model, spec), ...negative };
  }
  if (model.key === "fal-flux-2-pro") {
    const size = FLUX_SIZES[aspectFor(model, spec)];
    return { prompt: spec.prompt, image_size: size, output_format: "png", ...(spec.seed !== undefined ? { seed: spec.seed } : {}) };
  }
  throw new MediaError(`No fal request shape is defined for ${model.key}.`, { category: "validation" });
}

/** What this job bills, carried in meta because fal never echoes it back. */
function billedQuantity(model: ModelDescriptor, spec: GenerationSpec): { quantity: number; unit: CostUnit } {
  if (model.kind === "video") return { quantity: secondsFor(model, spec), unit: "video_seconds" };
  return { quantity: spec.count ?? 1, unit: "images" };
}

/** The documented URL shapes — the FALLBACK for rows without persisted meta. */
const constructedUrls = (model: ModelDescriptor, requestId: string) => ({
  statusUrl: `https://queue.fal.run/${model.vendorModelId}/requests/${requestId}/status`,
  responseUrl: `https://queue.fal.run/${model.vendorModelId}/requests/${requestId}`,
});

/** Every output URL the payload names, in the shapes fal's models use. */
export function urlsFrom(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const b = body as { video?: { url?: string }; images?: Array<{ url?: string }>; audio?: { url?: string } };
  const urls = [b.video?.url, b.audio?.url, ...(b.images ?? []).map((i) => i?.url)];
  return urls.filter((u): u is string => typeof u === "string" && u.length > 0);
}

function succeededState(handle: MediaJobHandle, model: ModelDescriptor, body: unknown): MediaJobState {
  const outputUrls = urlsFrom(body);
  if (outputUrls.length === 0) {
    return { handle, status: "failed", error: new MediaError("The model completed but returned no output.", { category: "unknown" }) };
  }
  const quantity = typeof handle.meta?.quantity === "number" ? handle.meta.quantity : model.kind === "image" ? 1 : null;
  const unit = (handle.meta?.unit as CostUnit | undefined) ?? (model.kind === "image" ? "images" : "video_seconds");
  return {
    handle,
    status: "succeeded",
    outputUrls,
    // The rate is published and verified on the model page, so the cost is
    // arithmetic, not an estimate — and reporting it here is what keeps the
    // spend ceiling armed without a config step (docs/bugs/B-009).
    usage:
      quantity !== null
        ? { quantity, unit, costUsd: model.cost.verified && model.cost.amountUsd !== null ? Math.round(quantity * model.cost.amountUsd * 1e6) / 1e6 : undefined }
        : undefined,
  };
}

export function falAdapter(): MediaAdapter {
  return {
    key: "fal",
    // Deliberately absent `synchronous`: everything goes through the queue.
    models: () => FAL_MODELS,
    configured: () => config() !== null,
    estimate: (model, spec) => estimate(model, spec),

    async start(model, spec, idempotencyKey) {
      const c = need(config());
      const input = inputFor(model, spec); // validation throws BEFORE attempted.add — nothing was sent
      const billed = billedQuantity(model, spec);

      // Recorded BEFORE the call: if submit throws ambiguously, reconcile must know we tried.
      attempted.add(idempotencyKey);
      const queued = await submit(c, model.vendorModelId, input);
      if (!queued.request_id) throw new MediaError("fal accepted the job but returned no request id.", { category: "unknown", ambiguous: true });

      const urls = { statusUrl: queued.status_url, responseUrl: queued.response_url };
      return {
        adapter: "fal",
        modelKey: model.key,
        remoteJobId: queued.request_id,
        idempotencyKey,
        meta: { ...urls, quantity: billed.quantity, unit: billed.unit },
      };
    },

    async poll(handle) {
      const c = need(config());
      const model = modelFor(handle.modelKey);
      if (!model) throw new MediaError(`Unknown fal model ${handle.modelKey}.`, { category: "validation" });
      const fallback = constructedUrls(model, handle.remoteJobId);
      const statusUrl = typeof handle.meta?.statusUrl === "string" ? handle.meta.statusUrl : fallback.statusUrl;
      const responseUrl = typeof handle.meta?.responseUrl === "string" ? handle.meta.responseUrl : fallback.responseUrl;

      const status = (await readStatus(c, statusUrl)).status ?? "";
      if (status === "IN_QUEUE") return { handle, status: "queued" };
      if (status !== "COMPLETED") return { handle, status: "running" }; // unknown statuses stay running, never finished

      try {
        return succeededState(handle, model, await readResponse(c, responseUrl));
      } catch (err) {
        // A non-retryable refusal from the response endpoint IS the verdict on
        // a completed request; a transient one is rethrown for the next sweep.
        if (err instanceof MediaError && !err.retryable && !err.ambiguous) return { handle, status: "failed", error: err };
        throw err;
      }
    },

    async fetch(state) {
      const model = modelFor(state.handle.modelKey);
      const mime = model?.kind === "video" ? "video/mp4" : "image/png";
      const urls = state.outputUrls ?? [];
      if (urls.length === 0) throw new MediaError("The fal job succeeded but named no output.", { category: "unknown" });
      const outputs: RawOutput[] = [];
      for (const url of urls) outputs.push({ bytes: await download(url), claimedMimeType: mime });
      return outputs;
    },

    async reconcile(idempotencyKey) {
      if (!attempted.has(idempotencyKey)) return null;
      throw new MediaError(
        "A fal job was started for this request and its result was lost. fal exposes no idempotency lookup, so resolve it by hand before retrying.",
        { category: "unknown", ambiguous: true },
      );
    },
  };
}

export { FAL_MODELS } from "./models";
/** Tests only: forget what this process attempted. */
export const __resetFalJobs = () => attempted.clear();
