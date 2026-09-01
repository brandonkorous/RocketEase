/*
 * The mock adapter.
 *
 * A first-class adapter, not a test double — the same role the mock provider
 * plays for networks. It drives the whole loop with no network and no spend, and
 * it is deliberately AWKWARD in the ways real vendors are:
 *
 *   - work is not instant: `poll` reports `running` for a few ticks
 *   - video is delivered by URL with a TTL, so the fetch deadline is real
 *   - outputs CLAIM a duration slightly off the truth, so normalization's
 *     mismatch detection has something to catch locally
 *   - `reconcile` finds a job by idempotency key, so the no-double-spend rule
 *     is exercised rather than assumed
 *
 * Enabled by MEDIA_ENABLE_MOCK=1.
 */
import type { MediaAdapter, WebhookRequest } from "../adapter";
import { estimate } from "../cost";
import type { ModelDescriptor } from "../io";
import { MOCK_MODELS } from "./models";
import { mockTranscribe } from "./transcribe";
import { renderFixture } from "./fixtures";
import { MediaError, type GenerationSpec, type MediaJobHandle, type MediaJobState, type RawOutput } from "../types";

/** Polls before a job completes. Enough to prove the poller works, fast enough for tests. */
export const MOCK_POLLS_BEFORE_DONE = 2;

type Job = { handle: MediaJobHandle; spec: GenerationSpec; model: ModelDescriptor; polls: number; startedAt: number };

/**
 * In-process store, like the mock provider's. It lives in whichever process
 * created the job, which is why local flows go through the worker rather than
 * calling in-process from the web app.
 */
const jobs = new Map<string, Job>();
const byIdempotency = new Map<string, string>();

export const __resetMockJobs = () => {
  jobs.clear();
  byIdempotency.clear();
};

let counter = 0;
const nextId = () => `mockjob_${++counter}_${Date.now().toString(36)}`;

export function mockAdapter(): MediaAdapter {
  return {
    key: "mock",
    models: () => MOCK_MODELS,
    configured: () => process.env.MEDIA_ENABLE_MOCK === "1",
    estimate: (model, spec) => estimate(model, spec),

    async start(model, spec, idempotencyKey) {
      if (!this.configured()) throw new MediaError("Mock media adapter is off.", { category: "unconfigured" });

      // Same key, same job: the caller must never be billed twice for a retry.
      const existing = byIdempotency.get(idempotencyKey);
      if (existing) return jobs.get(existing)!.handle;

      const remoteJobId = nextId();
      const handle: MediaJobHandle = { adapter: "mock", modelKey: model.key, remoteJobId, idempotencyKey };
      jobs.set(remoteJobId, { handle, spec, model, polls: 0, startedAt: Date.now() });
      byIdempotency.set(idempotencyKey, remoteJobId);
      return handle;
    },

    async poll(handle) {
      const job = jobs.get(handle.remoteJobId);
      if (!job) throw new MediaError("No such mock job.", { category: "validation" });
      job.polls += 1;
      if (job.polls <= MOCK_POLLS_BEFORE_DONE) {
        return { handle, status: "running", progress: Math.round((job.polls / (MOCK_POLLS_BEFORE_DONE + 1)) * 100) };
      }
      const ttl = job.model.io.outputs.urlTtlSeconds;
      return {
        handle,
        status: "succeeded",
        progress: 100,
        outputUrls: [`mock://output/${handle.remoteJobId}`],
        expiresAt: ttl ? new Date(Date.now() + ttl * 1000).toISOString() : undefined,
        usage: usageFor(job),
      };
    },

    async fetch(state) {
      const job = jobs.get(state.handle.remoteJobId);
      if (!job) throw new MediaError("No such mock job.", { category: "validation" });
      if (state.expiresAt && new Date(state.expiresAt) <= new Date()) {
        throw new MediaError("The mock output URL expired before it was fetched.", { category: "temporary", retryable: false });
      }
      const count = Math.min(Math.max(1, job.spec.count ?? 1), job.model.io.outputs.count.max);
      return Array.from({ length: count }, (_, i) => renderFixture(job.model, job.spec, i)) satisfies RawOutput[];
    },

    async reconcile(idempotencyKey) {
      const remoteJobId = byIdempotency.get(idempotencyKey);
      if (!remoteJobId) return null;
      return this.poll(jobs.get(remoteJobId)!.handle);
    },

    parseWebhook(req: WebhookRequest): MediaJobState | null {
      try {
        const body = JSON.parse(req.body) as { remoteJobId?: string };
        if (!body.remoteJobId) return null;
        const job = jobs.get(body.remoteJobId);
        return job ? { handle: job.handle, status: "succeeded", outputUrls: [`mock://output/${body.remoteJobId}`], usage: usageFor(job) } : null;
      } catch {
        return null;
      }
    },

    async transcribe(req) {
      if (!this.configured()) throw new MediaError("Mock media adapter is off.", { category: "unconfigured" });
      return mockTranscribe(req);
    },

    async cancel(handle) {
      jobs.delete(handle.remoteJobId);
    },
  };
}

/** What the "vendor" says it consumed — the number the ledger records. */
function usageFor(job: Job): MediaJobState["usage"] {
  const unit = job.model.cost.unit;
  const count = Math.max(1, job.spec.count ?? 1);
  if (unit === "video_seconds" || unit === "audio_seconds") return { quantity: (job.spec.durationSeconds ?? 0) * count, unit, costUsd: 0 };
  if (unit === "characters") return { quantity: job.spec.prompt.length, unit, costUsd: 0 };
  return { quantity: count, unit, costUsd: 0 };
}

export { MOCK_MODELS } from "./models";
