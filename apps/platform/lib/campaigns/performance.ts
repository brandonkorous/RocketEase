/*
 * Campaign performance = the analytics helpers filtered by campaignId
 * (deterministic attribution: the campaign's posts + its linked ad campaigns).
 */
import type { ReportFilters } from "@/db/schema/analytics";
import { METRICS, type DisplayMetric, type MetricContract } from "@/lib/analytics/metrics";
import { comparisonPeriod, delta, type AnalyticsFilters } from "@/lib/analytics/periods";
import { seriesByNetwork, topPosts, totals, type SeriesPoint, type TopPost, type Totals } from "@/lib/analytics/queries";
import { derived } from "@/lib/analytics/derive";

export type CampaignCard = { contract: MetricContract; value: number | null; previous: number | null; delta: ReturnType<typeof delta>; unavailable: string | null };
export type CampaignPerformance = { cards: CampaignCard[]; all: Totals; organic: Totals; paid: Totals; trend: SeriesPoint[]; top: TopPost[]; compareLabel: { from: string; to: string } | null };

export const CAMPAIGN_CARDS: DisplayMetric[] = ["spend", "reach", "engagement", "conversions", "roas"];
const PAID_KEYS: DisplayMetric[] = ["spend", "conversions", "cpm", "cpc", "ctr_paid", "cpa"];

function card(key: DisplayMetric, cur: Totals, prev: Totals | null, hasPaid: boolean, hasAny: boolean): CampaignCard {
  const contract = METRICS[key];
  const unavailable = contract.unavailable ?? (PAID_KEYS.includes(key) && !hasPaid ? "No ad campaign is linked to this campaign yet." : hasAny ? null : "No insights for this campaign in the period.");
  const value = unavailable ? null : derived(key, cur);
  const previous = unavailable || !prev ? null : derived(key, prev);
  return { contract, value, previous, delta: delta(value, previous), unavailable };
}

/** Everything the Overview/Performance tabs show, scoped to one campaign. */
export async function campaignPerformance(workspaceId: string, campaignId: string, filters: AnalyticsFilters, cards: DisplayMetric[] = CAMPAIGN_CARDS): Promise<CampaignPerformance> {
  const f: ReportFilters = { ...filters, campaignId };
  const cmp = comparisonPeriod(f);
  const [all, prev, organic, paid, trend, top] = await Promise.all([
    totals(workspaceId, f, f),
    cmp ? totals(workspaceId, f, cmp) : Promise.resolve<Totals | null>(null),
    totals(workspaceId, { ...f, scope: "organic" }, f),
    totals(workspaceId, { ...f, scope: "paid" }, f),
    seriesByNetwork(workspaceId, f, f, "reach"),
    topPosts(workspaceId, f, f, "engagement", 5),
  ]);
  const hasPaid = paid.spend != null;
  const hasAny = Object.keys(all).length > 0;
  return { cards: cards.map((k) => card(k, all, prev, hasPaid, hasAny)), all, organic, paid, trend, top, compareLabel: cmp };
}
