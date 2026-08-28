/*
 * Campaign performance = the analytics helpers filtered by campaignId
 * (deterministic attribution: the campaign's posts + its linked ad campaigns).
 */
import type { ReportFilters } from "@/db/schema/analytics";
import { METRICS, type DisplayMetric, type MetricContract } from "@/lib/analytics/metrics";
import { comparisonPeriod, delta, type AnalyticsFilters } from "@/lib/analytics/periods";
import { seriesByNetwork, topPosts, totals, type SeriesPoint, type TopPost, type Totals } from "@/lib/analytics/queries";
import { derived } from "@/lib/analytics/derive";
import { conversionState, type ConversionState } from "@/lib/tracking/conversions";
import { conversionProvenance, trackingUnavailable, type ConversionProvenance } from "@/lib/tracking/availability";
import { formatInZone } from "@/lib/time";

export type CampaignCard = { contract: MetricContract; value: number | null; previous: number | null; delta: ReturnType<typeof delta>; unavailable: string | null };
export type CampaignPerformance = { cards: CampaignCard[]; all: Totals; organic: Totals; paid: Totals; trend: SeriesPoint[]; top: TopPost[]; compareLabel: { from: string; to: string } | null; conversions: ConversionState; conversionProvenance: ConversionProvenance | null; conversionsFreshLabel: string | null };

export const CAMPAIGN_CARDS: DisplayMetric[] = ["spend", "reach", "engagement", "conversions", "roas"];
const PAID_KEYS: DisplayMetric[] = ["spend", "conversions", "cpm", "cpc", "ctr_paid", "cpa"];

type CardInput = { cur: Totals; prev: Totals | null; paid: Totals; hasAny: boolean; conversions: ConversionState };

function card(key: DisplayMetric, i: CardInput): CampaignCard {
  const contract = METRICS[key];
  const tracking = trackingUnavailable(key, i.conversions, i.paid);
  const unavailable = tracking !== undefined ? tracking : (contract.unavailable ?? (PAID_KEYS.includes(key) && i.paid.spend == null ? "No ad campaign is linked to this campaign yet." : i.hasAny ? null : "No insights for this campaign in the period."));
  // ROAS divides paid revenue by paid spend, so it never reads the combined bag.
  const bag = key === "roas" ? i.paid : i.cur;
  const value = unavailable ? null : derived(key, bag);
  const previous = unavailable || !i.prev || key === "roas" ? null : derived(key, i.prev);
  return { contract, value, previous, delta: delta(value, previous), unavailable };
}

/** Everything the Overview/Performance tabs show, scoped to one campaign. */
export async function campaignPerformance(workspaceId: string, campaignId: string, filters: AnalyticsFilters, cards: DisplayMetric[] = CAMPAIGN_CARDS, tz = "UTC"): Promise<CampaignPerformance> {
  const f: ReportFilters = { ...filters, campaignId };
  const cmp = comparisonPeriod(f);
  const [all, prev, organic, paid, trend, top, conversions] = await Promise.all([
    totals(workspaceId, f, f),
    cmp ? totals(workspaceId, f, cmp) : Promise.resolve<Totals | null>(null),
    totals(workspaceId, { ...f, scope: "organic" }, f),
    totals(workspaceId, { ...f, scope: "paid" }, f),
    seriesByNetwork(workspaceId, f, f, "reach"),
    topPosts(workspaceId, f, f, "engagement", 5),
    conversionState(workspaceId),
  ]);
  const input: CardInput = { cur: all, prev, paid, hasAny: Object.keys(all).length > 0, conversions };
  const conversionsFreshLabel = conversions.lastSyncAt ? formatInZone(conversions.lastSyncAt, tz) : null;
  return { cards: cards.map((k) => card(k, input)), all, organic, paid, trend, top, compareLabel: cmp, conversions, conversionProvenance: conversionProvenance(conversions), conversionsFreshLabel };
}
