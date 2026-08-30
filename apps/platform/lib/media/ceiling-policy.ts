/*
 * The ceiling decision — pure, so the rules are testable without a database.
 *
 * Blast-radius limits, NOT pricing. Pricing is deliberately deferred
 * (docs/media-generation.md §9), but a feature that can spend without bound
 * needs a ceiling on day one: a runaway loop on our own key is still our own
 * money, and this is the mechanism every customer will eventually depend on.
 */
import { isUnknownCost, type CostEstimate } from "@rocketease/media";

export type CeilingRefusal = { error: string; code: "media_ceiling" };
export type CeilingCheck = { allowed: true } | CeilingRefusal;

export type Ceilings = { perJob: number | null; perMonth: number | null; spentThisMonth: number };

const money = (n: number) => `$${n.toFixed(2)}`;

/**
 * An estimate we cannot compute does NOT bypass the ceiling: with a per-job
 * limit configured, an unpriceable job is refused rather than waved through,
 * because "we don't know what this costs" is the worst reason to spend.
 */
export function decideCeiling(estimate: CostEstimate, c: Ceilings): CeilingCheck {
  if (c.perJob === null && c.perMonth === null) return { allowed: true };

  if (isUnknownCost(estimate) || estimate.amountUsd === null) {
    if (c.perJob === null) return { allowed: true };
    return {
      error: "This model has no configured rate, so its cost can't be checked against the spending limit. Set a rate before generating.",
      code: "media_ceiling",
    };
  }

  if (c.perJob !== null && estimate.amountUsd > c.perJob) {
    return { error: `That would cost about ${money(estimate.amountUsd)}, above the ${money(c.perJob)} limit for a single generation.`, code: "media_ceiling" };
  }

  if (c.perMonth !== null && c.spentThisMonth + estimate.amountUsd > c.perMonth) {
    const left = Math.max(0, c.perMonth - c.spentThisMonth);
    return {
      error: `This month's generation limit of ${money(c.perMonth)} is nearly used — ${money(left)} remains and this would cost about ${money(estimate.amountUsd)}.`,
      code: "media_ceiling",
    };
  }

  return { allowed: true };
}

/** A configured dollar limit, or null. A malformed value is ignored, never read as 0. */
export function parseCeiling(raw: string | undefined): number | null {
  if (!raw?.trim()) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export const startOfMonth = (now = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
