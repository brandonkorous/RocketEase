import type { Totals } from "./queries";
import { paidRatio, type DisplayMetric } from "./metrics";

/** Engagement total: provider total when present, else the sum of its parts. Plain module (safe for client components). */
export const engagementOf = (t: Totals) => t.engagement ?? (t.reactions != null || t.comments != null || t.shares != null || t.saves != null ? (t.reactions ?? 0) + (t.comments ?? 0) + (t.shares ?? 0) + (t.saves ?? 0) : undefined);

/** Scorecard value for a display metric from a totals bag (sums, rates, paid ratios). */
export function derived(key: DisplayMetric, t: Totals): number | null {
  if (key === "engagement") return engagementOf(t) ?? null;
  if (key === "engagement_rate") return t.reach ? (engagementOf(t) ?? 0) / t.reach : null;
  if (key === "ctr") return t.impressions ? (t.link_clicks ?? 0) / t.impressions : null;
  if (key === "cpm" || key === "cpc" || key === "ctr_paid" || key === "cpa") return paidRatio(key, t);
  // ROAS is only meaningful over a paid totals bag: paid-medium revenue ÷ spend.
  // A missing revenue fact is missing, not zero — never divide 0 by spend.
  if (key === "roas") return t.spend && t.revenue != null ? t.revenue / t.spend : null;
  if (key in t) return (t as Record<string, number>)[key] ?? null;
  return null;
}
