import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { channel } from "@/db/schema/connections";
import { requireWorkspace, hasCapability } from "@/lib/session";
import { formatInZone } from "@/lib/time";
import { derived } from "./derive";
import { METRICS, PAID_METRICS, SCORECARD, type DisplayMetric, type MetricContract } from "./metrics";
import { campaign } from "@/db/schema/campaigns";
import { paidAttribution, type PaidAttribution } from "@/lib/campaigns/attribution";
import { comparisonPeriod, delta, parseAnalyticsFilters, periodLabel, type AnalyticsFilters } from "./periods";
import { openQuality, type QualitySummary } from "./quality-store";
import { conversionState, type ConversionState } from "@/lib/tracking/conversions";
import { conversionProvenance, trackingUnavailable, type ConversionProvenance } from "@/lib/tracking/availability";
import { channelMix, followersByNetwork, freshness, seriesByNetwork, topPosts, totals, type ChannelMix, type SeriesPoint, type TopPost, type Totals } from "./queries";

export type ScoreCard = { contract: MetricContract; value: number | null; previous: number | null; delta: ReturnType<typeof delta>; unavailable: string | null };
export type AnalyticsData = {
  workspaceId: string;
  timezone: string;
  filters: AnalyticsFilters;
  periodLabel: string;
  compareLabel: string | null;
  partial: boolean;
  channels: { id: string; name: string; network: string }[];
  scorecard: ScoreCard[];
  /** Organic-only and paid-only totals for the split table; scorecards use the selected scope. */
  organic: Totals;
  paid: Totals;
  paidAttribution: PaidAttribution | null;
  /** Conversion tracking sources and the provenance shown next to every conversion number (M7). */
  conversions: ConversionState;
  conversionProvenance: ConversionProvenance | null;
  conversionsRefreshedLabel: string | null;
  campaigns: { id: string; name: string }[];
  trend: SeriesPoint[];
  followers: SeriesPoint[];
  followersTotal: number | null;
  followersPrev: number | null;
  mix: ChannelMix[];
  top: TopPost[];
  topBy: "engagement" | "reach" | "link_clicks";
  refreshedLabel: string | null;
  stale: { name: string; network: string; lastError: string | null }[];
  quality: QualitySummary;
  canExport: boolean;
  hasData: boolean;
  isDev: boolean;
};

/** Engagement falls back to the sum of its parts when a provider reports no total (post-level facts). */


const NO_PAID = "No paid data in this period. Connect an ad account from a campaign's Ads tab to import spend and conversions.";

export async function loadAnalyticsData(workspaceId: string, sp: Record<string, string | string[] | undefined>): Promise<AnalyticsData> {
  const { workspace } = await requireWorkspace(workspaceId);
  const tz = workspace.timezone;
  const filters = parseAnalyticsFilters(sp, tz);
  const cmp = comparisonPeriod(filters);
  const topBy = (["engagement", "reach", "link_clicks"].includes(String(sp.top)) ? String(sp.top) : "engagement") as AnalyticsData["topBy"];
  const [channels, cur, prev, organic, paid, attribution, campaigns, trend, followers, mix, top, fresh, quality, conversions] = await Promise.all([
    db.select({ id: channel.id, name: channel.name, network: channel.network }).from(channel).where(and(eq(channel.workspaceId, workspaceId), inArray(channel.status, ["healthy", "degraded"]))),
    totals(workspaceId, filters, filters),
    cmp ? totals(workspaceId, filters, cmp) : Promise.resolve<Totals>({}),
    filters.scope === "paid" ? Promise.resolve<Totals>({}) : totals(workspaceId, { ...filters, scope: "organic" }, filters),
    filters.scope === "organic" ? Promise.resolve<Totals>({}) : totals(workspaceId, { ...filters, scope: "paid" }, filters),
    paidAttribution(workspaceId, tz),
    db.select({ id: campaign.id, name: campaign.name }).from(campaign).where(and(eq(campaign.workspaceId, workspaceId), isNull(campaign.archivedAt))).orderBy(campaign.name),
    seriesByNetwork(workspaceId, filters, filters, "engagement"),
    followersByNetwork(workspaceId, filters, filters),
    channelMix(workspaceId, filters, filters),
    topPosts(workspaceId, filters, filters, topBy),
    freshness(workspaceId),
    openQuality(workspaceId),
    conversionState(workspaceId),
  ]);
  const hasData = Object.keys(cur).length > 0;
  const scorecard: ScoreCard[] = SCORECARD.map((key) => {
    const contract = METRICS[key];
    // Tracking-supplied metrics answer for themselves; everything else falls through to the paid/organic rule.
    const tracking = trackingUnavailable(key, conversions, paid);
    const unavailable = tracking !== undefined ? tracking : (contract.unavailable ?? (PAID_METRICS.includes(key) && paid.spend == null ? NO_PAID : hasData ? null : "No insights ingested yet."));
    // ROAS divides paid revenue by paid spend, so it never reads the selected-scope bag.
    const bag = key === "roas" ? paid : cur;
    const value = unavailable ? null : derived(key, bag);
    const previous = unavailable || !cmp || key === "roas" ? null : derived(key, prev);
    return { contract, value, previous, delta: delta(value, previous), unavailable };
  });
  return {
    workspaceId, timezone: tz, filters, periodLabel: periodLabel(filters), compareLabel: cmp ? periodLabel(cmp) : null, partial: false,
    channels, scorecard, organic, paid, paidAttribution: paid.spend == null ? null : attribution, conversions, conversionProvenance: conversionProvenance(conversions), conversionsRefreshedLabel: conversions.lastSyncAt ? formatInZone(conversions.lastSyncAt, tz) : null, campaigns, trend, followers, followersTotal: cur.followers ?? null, followersPrev: prev.followers ?? null, mix, top, topBy,
    refreshedLabel: fresh.latestAt ? formatInZone(fresh.latestAt, tz) : null, stale: fresh.staleChannels.map((s) => ({ name: s.name, network: s.network, lastError: s.lastError })), quality,
    canExport: hasCapability(workspace, "reports.export"), hasData, isDev: process.env.NODE_ENV !== "production",
  };
}
