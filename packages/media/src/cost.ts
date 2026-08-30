/*
 * What a job will cost, or an honest refusal to guess.
 *
 * PLACEHOLDER, and deliberately so: this repo ships no invented per-second rate
 * for anybody's model, the same rule lib/ai/usage/prices.ts already follows.
 * With no rate configured, `amountUsd` stays null and the UI says the cost is
 * unknown rather than showing a confident wrong number.
 *
 * Pricing is deferred (docs/media-generation.md §9). This exists now so real
 * cost accrues from the first render and can be priced from measurement.
 */
import type { ModelDescriptor } from "./io";
import type { CostEstimate, CostUnit, GenerationSpec } from "./types";

/** How much of the billed unit this request consumes. */
export function quantityFor(model: ModelDescriptor, spec: GenerationSpec): { quantity: number; unit: CostUnit } | null {
  const unit = model.cost.unit;
  const count = Math.max(1, spec.count ?? 1);
  switch (unit) {
    case "images":
    case "renders":
      return { quantity: count, unit };
    case "video_seconds":
    case "audio_seconds": {
      const seconds = spec.durationSeconds;
      if (!seconds || seconds <= 0) return null;
      return { quantity: seconds * count, unit };
    }
    case "characters":
      return { quantity: spec.prompt.length, unit };
    case "tokens":
      return null; // token counts come back from the vendor; never guessed up front
  }
}

/**
 * An estimate for one job. Returns `{ unknown }` — with a reason a person can
 * act on — rather than a number we cannot stand behind.
 */
export function estimate(model: ModelDescriptor, spec: GenerationSpec, rates: Record<string, number> = {}): CostEstimate {
  const q = quantityFor(model, spec);
  if (!q) return { unknown: `${model.label} bills per ${model.cost.unit.replace(/_/g, " ")}, and this request doesn't say how many.` };

  const rate = rates[model.key] ?? model.cost.amountUsd;
  if (rate === null || rate === undefined) {
    return { unknown: `No rate is configured for ${model.label}, so the cost can't be shown before running it.` };
  }
  return {
    quantity: q.quantity,
    unit: q.unit,
    amountUsd: Math.round(rate * q.quantity * 1e6) / 1e6,
    verified: model.cost.verified,
  };
}

/**
 * Deployment-configured rates, shaped like AI_PRICES_JSON:
 *   AI_MEDIA_RATES_JSON={"veo-3.1":0.40,"mock-video":0}
 * A malformed value is ignored with a warning rather than treated as zero.
 */
export function parseRates(raw: string | undefined, warn: (m: string) => void = () => {}): Record<string, number> {
  if (!raw?.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    warn("AI_MEDIA_RATES_JSON is not valid JSON; media generation stays unpriced");
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) out[key] = value;
  }
  return out;
}

/** Sum of what is known. Anything unknown is reported, never counted as zero. */
export function totalEstimate(estimates: CostEstimate[]): { amountUsd: number; unknownCount: number } {
  let amountUsd = 0;
  let unknownCount = 0;
  for (const e of estimates) {
    if ("unknown" in e || e.amountUsd === null) unknownCount++;
    else amountUsd += e.amountUsd;
  }
  return { amountUsd: Math.round(amountUsd * 1e6) / 1e6, unknownCount };
}
