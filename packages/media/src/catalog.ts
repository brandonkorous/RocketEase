/*
 * The model registry.
 *
 * Same discipline as packages/providers/src/cost.ts and the platform's
 * ad-specs.ts: every number carries its source, and anything we could not
 * confirm from the vendor's own documentation is `verified: false` and can only
 * ever warn — never a silent choice.
 *
 * Rules this file exists to enforce (docs/media-models.md §4):
 *   1. `vendorModelId` is pinned exactly and never constructed at runtime.
 *   2. Retired models are never deleted — old media_job rows must still resolve.
 *   3. `indemnity: null` means the vendor does not say. Not the same as false.
 *
 * STAGE 12.1 SHIPS MOCK ENTRIES ONLY. Real descriptors land with their adapters
 * in 12.2+, each one read off the vendor's page by a person on `checkedAt`.
 */
import { MOCK_MODELS } from "./mock/models";
import { isRetired, type ModelDescriptor } from "./io";
import type { JobKind } from "./types";

/** Split to catalog/{video,image,audio}.ts once real models push this past 250 lines. */
export const MODELS: ModelDescriptor[] = [...MOCK_MODELS];

const BY_KEY = new Map(MODELS.map((m) => [m.key, m]));

/** Includes retired models on purpose: a historic job must still resolve to a name. */
export const modelByKey = (key: string): ModelDescriptor | null => BY_KEY.get(key) ?? null;

/** Human-readable name for a job row, even for a model we no longer offer. */
export const modelLabel = (key: string): string => BY_KEY.get(key)?.label ?? key;

export type AdapterAvailability = (adapter: string) => boolean;

/** Every model that can serve this job kind, in registry order, minus retired ones. */
export function modelsForJob(jobKind: JobKind, now = new Date()): ModelDescriptor[] {
  return MODELS.filter((m) => m.jobs.includes(jobKind) && !isRetired(m, now));
}

/** Models a deployment can actually run, given which adapters are configured. */
export function availableModels(isConfigured: AdapterAvailability, now = new Date()): ModelDescriptor[] {
  return MODELS.filter((m) => !isRetired(m, now) && isConfigured(m.adapter));
}

export type CatalogEntry = {
  key: string;
  label: string;
  adapter: string;
  jobs: JobKind[];
  configured: boolean;
  retired: boolean;
  /** Why it cannot be used right now, or null. Drives the honest "why not" line. */
  unavailableReason: string | null;
};

/**
 * The whole registry with availability resolved — what a capability page and the
 * staff surface render. Never hides a model; explains it instead (M8.2).
 */
export function describeCatalog(isConfigured: AdapterAvailability, now = new Date()): CatalogEntry[] {
  return MODELS.map((m) => {
    const retired = isRetired(m, now);
    const configured = isConfigured(m.adapter);
    return {
      key: m.key,
      label: m.label,
      adapter: m.adapter,
      jobs: m.jobs,
      configured,
      retired,
      unavailableReason: retired
        ? `Retired on ${m.retiredAt}.`
        : !configured
          ? `The ${m.adapter} adapter isn't configured in this deployment.`
          : (m.reasons?.model ?? null),
    };
  });
}
