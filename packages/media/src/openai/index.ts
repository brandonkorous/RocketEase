/*
 * The images adapters: OpenAI direct, and the same models through Azure OpenAI.
 *
 * A SYNCHRONOUS vendor behind the async contract: `start` does the work, `poll`
 * reports it already done, `fetch` hands over the bytes it kept. adapter.ts
 * blesses this shape precisely so the caller never branches on which kind it got.
 *
 * The limit worth stating: /images/generations has no job record, so there is
 * nothing to look up after the fact. `reconcile` therefore answers from this
 * process only — it separates "never attempted here" (null, safe to start) from
 * "attempted and the answer was lost" (ambiguous, never silently re-spent). A
 * process restart erases both, and no vendor call can recover them.
 */
import type { MediaAdapter } from "../adapter";
import { estimate } from "../cost";
import type { ModelDescriptor } from "../io";
import { MediaError, type MediaJobHandle, type RawOutput } from "../types";
import { AZURE_OPENAI_MODELS, OPENAI_MODELS } from "./models";
import { requestImages, type Transport } from "./transport";

/** Kept only until fetched; a stranded entry is pruned rather than held forever. */
const RESULT_TTL_MS = 600_000;

type Result = { handle: MediaJobHandle; outputs: RawOutput[]; count: number; at: number };

/** Module-level, because buildRegistry() constructs a fresh adapter every call. */
const results = new Map<string, Result>();
/** Keys we sent to a vendor. Outlives the bytes, because spend outlives them. */
const attempted = new Set<string>();

export const __resetOpenAiJobs = () => {
  results.clear();
  attempted.clear();
};

const prune = (now = Date.now()) => {
  for (const [k, r] of results) if (now - r.at > RESULT_TTL_MS) results.delete(k);
};

let counter = 0;

type AdapterConfig = {
  key: string;
  models: ModelDescriptor[];
  configured: () => boolean;
  transport: Transport;
};

/** One synchronous images adapter. Both vendors differ only in `transport`. */
function imagesAdapter(cfg: AdapterConfig): MediaAdapter {
  // Namespaced so one adapter never reads the other's in-flight result.
  const slot = (idempotencyKey: string) => `${cfg.key}:${idempotencyKey}`;

  const doneState = (r: Result) => ({ handle: r.handle, status: "succeeded" as const, progress: 100, usage: { quantity: r.count, unit: "images" as const } });

  return {
    key: cfg.key,
    synchronous: true,
    models: () => cfg.models,
    configured: cfg.configured,
    estimate: (model, spec) => estimate(model, spec),

    async start(model, spec, idempotencyKey) {
      if (!cfg.configured()) throw new MediaError(`The ${cfg.key} adapter isn't configured.`, { category: "unconfigured" });
      prune();
      const done = results.get(slot(idempotencyKey));
      if (done) return done.handle;

      const count = Math.min(Math.max(1, spec.count ?? 1), model.io.outputs.count.max);
      // Recorded BEFORE the call: if this throws, reconcile must know we tried.
      attempted.add(slot(idempotencyKey));
      const outputs = await requestImages(cfg.transport, model, spec, count);

      const handle: MediaJobHandle = {
        adapter: cfg.key,
        modelKey: model.key,
        remoteJobId: `${cfg.key}_img_${++counter}_${Date.now().toString(36)}`,
        idempotencyKey,
      };
      results.set(slot(idempotencyKey), { handle, outputs, count, at: Date.now() });
      return handle;
    },

    async poll(handle) {
      const r = results.get(slot(handle.idempotencyKey));
      if (r) return doneState(r);
      // Billed, then lost. Saying "still running" would strand it forever.
      throw new MediaError("The generated image was lost before it could be stored. It may still have been billed.", {
        category: "unknown",
        retryable: false,
        ambiguous: attempted.has(slot(handle.idempotencyKey)),
      });
    },

    async fetch(state) {
      const key = slot(state.handle.idempotencyKey);
      const r = results.get(key);
      if (!r) throw new MediaError("The generated image is no longer held in memory.", { category: "unknown", retryable: false });
      results.delete(key); // Stored now; holding megabytes longer serves nobody.
      return r.outputs;
    },

    async reconcile(idempotencyKey) {
      const r = results.get(slot(idempotencyKey));
      if (r) return doneState(r);
      if (attempted.has(slot(idempotencyKey))) {
        throw new MediaError("This image request already reached the vendor, but its result was lost. It is not being sent again.", {
          category: "unknown",
          retryable: false,
          ambiguous: true,
        });
      }
      return null;
    },
  };
}

export function openaiAdapter(): MediaAdapter {
  return imagesAdapter({
    key: "openai",
    models: OPENAI_MODELS,
    configured: () => Boolean(process.env.OPENAI_API_KEY),
    transport: {
      url: () => "https://api.openai.com/v1/images/generations",
      headers: () => ({ authorization: `Bearer ${process.env.OPENAI_API_KEY}` }),
      modelInBody: true,
    },
  });
}

/** Trailing slashes on the endpoint are the classic Azure 404. */
const endpoint = () => (process.env.AZURE_OPENAI_ENDPOINT ?? "").replace(/\/+$/, "");

/**
 * The Azure DEPLOYMENT that serves this model, which is not the model's name.
 * sparx.works names deployments after the seam that uses them (`jotdojo-vision`)
 * so a bill line, a metric and an env var all read the same.
 *
 * This does NOT reintroduce "the model is an env var". The catalog still pins
 * WHICH model — `gpt-image-1`, in the descriptor and in every media_job row
 * forever. This only says what one Azure resource calls it. Unset, the
 * deployment is assumed to carry the model's own name.
 */
const deploymentFor = (model: ModelDescriptor) => process.env.AZURE_OPENAI_IMAGE_DEPLOYMENT || model.vendorModelId;

/**
 * Azure OpenAI. Same weights, the tenant's own region, the Azure agreement.
 *
 * The api-version has NO default: Azure changes behaviour across versions, and
 * guessing one is how you get a 400 that reads like a bug in our code.
 */
export function azureOpenAiAdapter(): MediaAdapter {
  return imagesAdapter({
    key: "azure-openai",
    models: AZURE_OPENAI_MODELS,
    configured: () => Boolean(endpoint() && process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_API_VERSION),
    transport: {
      url: (model) => `${endpoint()}/openai/deployments/${deploymentFor(model)}/images/generations?api-version=${process.env.AZURE_OPENAI_API_VERSION}`,
      headers: () => ({ "api-key": process.env.AZURE_OPENAI_API_KEY ?? "" }),
      modelInBody: false,
    },
  });
}

export { OPENAI_MODELS, AZURE_OPENAI_MODELS } from "./models";
