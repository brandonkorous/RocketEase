/*
 * Which model runs a job, and why.
 *
 * Three layers, most specific first (docs/media-models.md §7):
 *   1. a per-request pin — the person chose. Always honoured
 *   2. workspace policy — an agency standardised on, or excluded, a vendor
 *   3. the registry order for that job kind
 *
 * Every decision carries a `reason` string, stored on media_job and shown to the
 * person. M8.2 made "explain why a control is disabled" a product rule; this is
 * the same promise applied to a choice we made with their money.
 */
import { modelByKey, modelsForJob, type AdapterAvailability } from "./catalog";
import { isRetired, supportsDuration, type ModelDescriptor } from "./io";
import type { GenerationSpec } from "./types";

export type RoutingPolicy = {
  /** Model keys this workspace refuses, e.g. on legal grounds. */
  excludeModels?: string[];
  /** Adapters this workspace refuses. */
  excludeAdapters?: string[];
  /** Preferred model per job kind, tried before registry order. */
  prefer?: Partial<Record<string, string>>;
  /** Refuse models whose vendor offers no indemnity (agency-conservative). */
  requireIndemnity?: boolean;
};

export type RoutingResult =
  | { model: ModelDescriptor; reason: string; rejected: RoutingRejection[] }
  | { error: string; rejected: RoutingRejection[] };

export type RoutingRejection = { key: string; why: string };

export const isRouted = (r: RoutingResult): r is Extract<RoutingResult, { model: ModelDescriptor }> => "model" in r;

/** Why a candidate cannot serve this request, or null when it can. */
function rejectionFor(m: ModelDescriptor, spec: GenerationSpec, policy: RoutingPolicy, isConfigured: AdapterAvailability, now: Date): string | null {
  if (isRetired(m, now)) return `retired on ${m.retiredAt}`;
  if (!isConfigured(m.adapter)) return `the ${m.adapter} adapter isn't configured`;
  if (policy.excludeModels?.includes(m.key)) return "excluded by this workspace";
  if (policy.excludeAdapters?.includes(m.adapter)) return `${m.adapter} is excluded by this workspace`;
  if (policy.requireIndemnity && m.terms.indemnity !== true) {
    return m.terms.indemnity === null ? "the vendor doesn't state an indemnity" : "the vendor offers no indemnity";
  }
  if (!supportsDuration(m.io, spec.durationSeconds)) {
    const d = m.io.outputs.duration;
    const allowed = d?.allowed ? d.allowed.join(" or ") : d ? `${d.min}–${d.max}` : "no duration";
    return `it accepts ${allowed} seconds, not ${spec.durationSeconds}`;
  }
  const refs = spec.references?.filter((r) => r.role !== "source" && r.role !== "driving").length ?? 0;
  if (refs > 0 && (m.io.inputs.referenceImages?.max ?? 0) === 0) return "it takes no reference images";
  if (spec.references?.some((r) => r.role === "source") && !m.io.inputs.sourceVideo) return "it cannot edit existing footage";
  if (spec.references?.some((r) => r.role === "driving") && !m.io.inputs.drivingPerformance) return "it takes no driving performance";
  if (spec.count && spec.count > m.io.outputs.count.max) return `it returns at most ${m.io.outputs.count.max} per request`;
  return null;
}

/**
 * Pick a model. Fallback happens only BEFORE any spend — an unconfigured,
 * retired or unsuitable candidate is skipped with a reason. Falling back after
 * an ambiguous vendor result is never routing's job: that is reconciliation.
 */
export function routeJob(
  spec: GenerationSpec,
  opts: { policy?: RoutingPolicy; isConfigured: AdapterAvailability; now?: Date },
): RoutingResult {
  const policy = opts.policy ?? {};
  const now = opts.now ?? new Date();
  const rejected: RoutingRejection[] = [];

  if (spec.modelKey) {
    const pinned = modelByKey(spec.modelKey);
    if (!pinned) return { error: `No model called "${spec.modelKey}".`, rejected };
    if (!pinned.jobs.includes(spec.jobKind)) return { error: `${pinned.label} doesn't do ${spec.jobKind.replace(/_/g, " ")}.`, rejected };
    const why = rejectionFor(pinned, spec, policy, opts.isConfigured, now);
    if (why) return { error: `${pinned.label} can't run this: ${why}.`, rejected };
    return { model: pinned, reason: `${pinned.label}: pinned for this request.`, rejected };
  }

  const preferred = policy.prefer?.[spec.jobKind];
  const candidates = modelsForJob(spec.jobKind, now);
  const ordered = preferred ? [...candidates].sort((a, b) => Number(b.key === preferred) - Number(a.key === preferred)) : candidates;

  for (const m of ordered) {
    const why = rejectionFor(m, spec, policy, opts.isConfigured, now);
    if (why) {
      rejected.push({ key: m.key, why });
      continue;
    }
    const because =
      m.key === preferred
        ? "preferred by this workspace"
        : rejected.length
          ? `first available for ${spec.jobKind.replace(/_/g, " ")} — ${rejected.map((r) => `${r.key} ${r.why}`).join("; ")}`
          : `best fit for ${spec.jobKind.replace(/_/g, " ")}`;
    return { model: m, reason: `${m.label}: ${because}.`, rejected };
  }

  if (!candidates.length) return { error: `No model does ${spec.jobKind.replace(/_/g, " ")} yet.`, rejected };
  return { error: `No model can run this ${spec.jobKind.replace(/_/g, " ")}: ${rejected.map((r) => `${r.key} ${r.why}`).join("; ")}.`, rejected };
}
