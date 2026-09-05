/**
 * @rocketease/media — the generative media contract.
 *
 * Server-side entry point: everything on ./client, plus the adapter interface
 * and the registry that binds adapters to the models they serve.
 */
export * from "./client";
export * from "./adapter";
export { mockAdapter, MOCK_MODELS, MOCK_POLLS_BEFORE_DONE, __resetMockJobs } from "./mock";
export { openaiAdapter, azureOpenAiAdapter, OPENAI_MODELS, AZURE_OPENAI_MODELS, __resetOpenAiJobs } from "./openai";
export { falAdapter, FAL_MODELS, __resetFalJobs } from "./fal";
export { soraAdapter, SORA_MODELS, __resetSoraJobs } from "./sora";
export { mockTranscribe, MOCK_TRANSCRIPT_CONFIDENCE, MOCK_FALLBACK_SECONDS } from "./mock/transcribe";

import { availabilityFrom, type AdapterRegistry, type MediaAdapter } from "./adapter";
import { falAdapter } from "./fal";
import { mockAdapter } from "./mock";
import { azureOpenAiAdapter, openaiAdapter } from "./openai";
import { soraAdapter } from "./sora";
import { speechAdapter } from "./speech";

/**
 * Adapters this deployment can use. Each decides for itself whether it is
 * configured, so an unset key means a hidden capability rather than a crash —
 * the rule lib/ai/client.ts already follows for ANTHROPIC_API_KEY.
 *
 * Remaining adapters (vertex, runway, elevenlabs) register here as they land.
 */
export function buildRegistry(extra: MediaAdapter[] = []): AdapterRegistry {
  const all = [mockAdapter(), azureOpenAiAdapter(), openaiAdapter(), falAdapter(), soraAdapter(), speechAdapter(), ...extra];
  return new Map(all.map((a) => [a.key, a]));
}

export { availabilityFrom };
