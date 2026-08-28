import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { channel } from "@/db/schema/connections";
import { requireWorkspace, hasCapability } from "@/lib/session";
import { formatInZone } from "@/lib/time";
import { METRICS, SCORECARD, type DisplayMetric, type MetricContract } from "./metrics";
import { comparisonPeriod, delta, parseAnalyticsFilters, periodLabel, type AnalyticsFilters } from "./periods";
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
  organic: Totals;
  trend: SeriesPoint[];
  followers: SeriesPoint[];
  followersTotal: number | null;
  followersPrev: number | null;
  mix: ChannelMix[];
  top: TopPost[];
  topBy: "engagement" | "reach" | "link_clicks";
  refreshedLabel: string | null;
  stale: { name: string; network: string; lastError: string | null }[];
  canExport: boolean;
  hasData: boolean;
  isDev: boolean;
};

function derived(key: DisplayMetric, t: Totals): number | null {
  if (key === "engagement_rate") return t.reach ? (t.engagement ?? 0) / t.reach : null;
  if (key === "ctr") return t.impressions ? (t.link_clicks ?? 0) / t.impressions : null;
  if (key in t) return (t as Record<string, number>)[key] ?? null;
  return null;
}

export async function loadAnalyticsData(workspaceId: string, sp: Record<string, string | string[] | undefined>): Promise<AnalyticsData> {
  const { workspace } = await requireWorkspace(workspaceId);
  const tz = workspace.timezone;
  const filters = parseAnalyticsFilters(sp, tz);
  const cmp = comparisonPeriod(filters);
  const topBy = (["engagement", "reach", "link_clicks"].includes(String(sp.top)) ? String(sp.top) : "engagement") as AnalyticsData["topBy"];
  const [channels, cur, prev, trend, followers, mix, top, fresh] = await Promise.all([
    db.select({ id: channel.id, name: channel.name, network: channel.network }).from(channel).where(and(eq(channel.workspaceId, workspaceId), inArray(channel.status, ["healthy", "degraded"]))),
    totals(workspaceId, filters, filters),
    cmp ? totals(workspaceId, filters, cmp) : Promise.resolve<Totals>({}),
    seriesByNetwork(workspaceId, filters, filters, "engagement"),
    followersByNetwork(workspaceId, filters, filters),
    channelMix(workspaceId, filters, filters),
    topPosts(workspaceId, filters, filters, topBy),
    freshness(workspaceId),
  ]);
  const hasData = Object.keys(cur).length > 0;
  const scorecard: ScoreCard[] = SCORECARD.map((key) => {
    const contract = METRICS[key];
    const unavailable = contract.unavailable ?? (hasData ? null : "No insights ingested yet.");
    const value = unavailable ? null : derived(key, cur);
    const previous = unavailable || !cmp ? null : derived(key, prev);
    return { contract, value, previous, delta: delta(value, previous), unavailable };
  });
  return {
    workspaceId, timezone: tz, filters, periodLabel: periodLabel(filters), compareLabel: cmp ? periodLabel(cmp) : null, partial: false,
    channels, scorecard, organic: cur, trend, followers, followersTotal: cur.followers ?? null, followersPrev: prev.followers ?? null, mix, top, topBy,
    refreshedLabel: fresh.latestAt ? formatInZone(fresh.latestAt, tz) : null, stale: fresh.staleChannels.map((s) => ({ name: s.name, network: s.network, lastError: s.lastError })),
    canExport: hasCapability(workspace, "reports.export"), hasData, isDev: process.env.NODE_ENV !== "production",
  };
}
