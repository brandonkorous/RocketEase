/**
 * @rocketease/media — the generative media contract.
 *
 * Server-side entry point: everything on ./client, plus the adapter interface
 * and the registry that binds adapters to the models they serve.
 */
export * from "./client";
export * from "./adapter";
export { mockAdapter, MOCK_MODELS, MOCK_POLLS_BEFORE_DONE, __resetMockJobs } from "./mock";

import { availabilityFrom, type AdapterRegistry, type MediaAdapter } from "./adapter";
import { mockAdapter } from "./mock";

/**
 * Adapters this deployment can use. Each decides for itself whether it is
 * configured, so an unset key means a hidden capability rather than a crash —
 * the rule lib/ai/client.ts already follows for ANTHROPIC_API_KEY.
 *
 * Real adapters (fal, vertex, runway, openai, elevenlabs) register here as they
 * land in 12.2+.
 */
export function buildRegistry(extra: MediaAdapter[] = []): AdapterRegistry {
  const all = [mockAdapter(), ...extra];
  return new Map(all.map((a) => [a.key, a]));
}

export { availabilityFrom };
