import { and, eq, gte, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import type { CanonicalMetric } from "@make-it-social/providers";
import { db } from "@/db";
import { metricFact } from "@/db/schema/analytics";
import { channel } from "@/db/schema/connections";
import { contentItem, postVariant, remotePublication } from "@/db/schema/content";
import { adCampaign, campaignContent } from "@/db/schema/campaigns";
import type { ReportFilters } from "@/db/schema/analytics";
import { conversionTotals } from "@/lib/tracking/conversions";

export type Period = { from: string; to: string };
/** `revenue` and `sessions` come from conversion tracking sources (M7), not from a provider's insights. */
export type Totals = Partial<Record<CanonicalMetric | "revenue" | "sessions", number>>;

const SUMMED: CanonicalMetric[] = ["impressions", "reach", "video_views", "reactions", "comments", "shares", "saves", "engagement", "link_clicks", "follower_gain", "watch_time_minutes", "spend", "conversions"];

/** Deterministic campaign attribution (analytics.md): the campaign's published posts and its linked ad campaigns. */
const campaignPostIds = (campaignId: string) => db.select({ id: remotePublication.remoteId }).from(remotePublication).innerJoin(postVariant, eq(postVariant.id, remotePublication.variantId)).innerJoin(campaignContent, eq(campaignContent.contentItemId, postVariant.contentItemId)).where(eq(campaignContent.campaignId, campaignId));
const campaignAdIds = (campaignId: string) => db.select({ id: adCampaign.remoteId }).from(adCampaign).where(eq(adCampaign.campaignId, campaignId));

function scopeWhere(workspaceId: string, f: ReportFilters, p: Period, entity: "channel" | "post"): SQL {
  const parts = [eq(metricFact.workspaceId, workspaceId), gte(metricFact.day, p.from), lte(metricFact.day, p.to)];
  if (f.channelId) parts.push(eq(metricFact.channelId, f.channelId));
  if (f.scope !== "all") parts.push(eq(metricFact.scope, f.scope));
  if (!f.campaignId) parts.push(eq(metricFact.entity, entity));
  else {
    // A campaign owns its posts' facts (organic + boosted) and its ad campaigns' paid facts; channel-level organic series are not attributable.
    const posts = and(eq(metricFact.entity, "post"), inArray(metricFact.remoteId, campaignPostIds(f.campaignId)))!;
    const ads = and(eq(metricFact.entity, "channel"), eq(metricFact.scope, "paid"), inArray(metricFact.remoteId, campaignAdIds(f.campaignId)))!;
    parts.push(entity === "post" ? posts : or(posts, ads)!);
  }
  return and(...parts)!;
}

/** Channel-level totals for a period (sums) plus end-of-period followers (last value per channel). */
export async function totals(workspaceId: string, f: ReportFilters, p: Period): Promise<Totals> {
  const rows = await db.select({ metric: metricFact.metric, v: sql<number>`sum(${metricFact.value})::float` }).from(metricFact).where(and(scopeWhere(workspaceId, f, p, "channel"), inArray(metricFact.metric, SUMMED))).groupBy(metricFact.metric);
  const out: Totals = {};
  for (const r of rows) out[r.metric] = Number(r.v);
  const last = await db.execute(sql`select sum(value)::float as v from (select distinct on (channel_id) value from metric_fact where ${scopeWhere(workspaceId, f, p, "channel")} and metric = 'followers' order by channel_id, day desc) t`);
  const v = (last as unknown as { v: number | null }[])[0]?.v;
  if (v != null) out.followers = Number(v);
  // Site-reported conversions/revenue/sessions. Non-paid mediums only in the
  // organic and combined scopes, so they never double-count the ad platform's.
  const site = await conversionTotals(workspaceId, f, p);
  if (site.conversions != null) out.conversions = (out.conversions ?? 0) + site.conversions;
  if (site.revenue != null) out.revenue = site.revenue;
  if (site.sessions != null) out.sessions = site.sessions;
  return out;
}

export type SeriesPoint = { day: string; network: string; value: number };
export async function seriesByNetwork(workspaceId: string, f: ReportFilters, p: Period, metric: CanonicalMetric): Promise<SeriesPoint[]> {
  const rows = await db
    .select({ day: metricFact.day, network: channel.network, v: sql<number>`sum(${metricFact.value})::float` })
    .from(metricFact)
    .innerJoin(channel, eq(channel.id, metricFact.channelId))
    .where(and(scopeWhere(workspaceId, f, p, "channel"), eq(metricFact.metric, metric)))
    .groupBy(metricFact.day, channel.network)
    .orderBy(metricFact.day);
  return rows.map((r) => ({ day: r.day, network: r.network, value: Number(r.v) }));
}

/** Followers per network per day = sum of the latest value per channel that day. */
export async function followersByNetwork(workspaceId: string, f: ReportFilters, p: Period): Promise<SeriesPoint[]> {
  const rows = await db
    .select({ day: metricFact.day, network: channel.network, v: sql<number>`sum(${metricFact.value})::float` })
    .from(metricFact)
    .innerJoin(channel, eq(channel.id, metricFact.channelId))
    .where(and(scopeWhere(workspaceId, f, p, "channel"), eq(metricFact.metric, "followers")))
    .groupBy(metricFact.day, channel.network)
    .orderBy(metricFact.day);
  return rows.map((r) => ({ day: r.day, network: r.network, value: Number(r.v) }));
}

export type ChannelMix = { channelId: string; name: string; network: string; value: number };
export async function channelMix(workspaceId: string, f: ReportFilters, p: Period, metric: CanonicalMetric = "engagement"): Promise<ChannelMix[]> {
  const rows = await db
    .select({ channelId: channel.id, name: channel.name, network: channel.network, v: sql<number>`sum(${metricFact.value})::float` })
    .from(metricFact)
    .innerJoin(channel, eq(channel.id, metricFact.channelId))
    .where(and(scopeWhere(workspaceId, f, p, "channel"), eq(metricFact.metric, metric)))
    .groupBy(channel.id, channel.name, channel.network)
    .orderBy(sql`sum(${metricFact.value}) desc`);
  return rows.map((r) => ({ channelId: r.channelId, name: r.name, network: r.network, value: Number(r.v) }));
}

export type TopPost = { itemId: string; title: string; network: string; channelName: string; publishedAt: Date; url: string | null; reach: number; engagement: number; clicks: number; thumbUrl?: string | null };
export async function topPosts(workspaceId: string, f: ReportFilters, p: Period, by: "engagement" | "reach" | "link_clicks" = "engagement", limit = 5): Promise<TopPost[]> {
  const rows = await db
    .select({
      itemId: contentItem.id, title: contentItem.title, network: channel.network, channelName: channel.name, publishedAt: remotePublication.publishedAt, url: remotePublication.url,
      reach: sql<number>`coalesce(sum(${metricFact.value}) filter (where ${metricFact.metric} = 'reach'), 0)::float`,
      engagement: sql<number>`coalesce(sum(${metricFact.value}) filter (where ${metricFact.metric} in ('reactions','comments','shares','saves')), 0)::float`,
      clicks: sql<number>`coalesce(sum(${metricFact.value}) filter (where ${metricFact.metric} = 'link_clicks'), 0)::float`,
    })
    .from(metricFact)
    .innerJoin(channel, eq(channel.id, metricFact.channelId))
    .innerJoin(remotePublication, and(eq(remotePublication.channelId, metricFact.channelId), eq(remotePublication.remoteId, metricFact.remoteId)))
    .innerJoin(postVariant, eq(postVariant.id, remotePublication.variantId))
    .innerJoin(contentItem, eq(contentItem.id, postVariant.contentItemId))
    .where(scopeWhere(workspaceId, f, p, "post"))
    .groupBy(contentItem.id, contentItem.title, channel.network, channel.name, remotePublication.publishedAt, remotePublication.url)
    .orderBy(sql`${sql.raw(by === "reach" ? "3" : by === "link_clicks" ? "5" : "4")} desc`)
    .limit(limit);
  return rows.map((r) => ({ ...r, reach: Number(r.reach), engagement: Number(r.engagement), clicks: Number(r.clicks) }));
}

/** Facts inside a period whose value was revised in the last 24h (provider corrections/backfills). */
export async function revisedFactsInPeriod(workspaceId: string, p: Period): Promise<{ count: number; from: string | null; to: string | null }> {
  const r = await db.execute(sql`select count(*)::int as count, min(day) as "from", max(day) as "to" from metric_fact where workspace_id = ${workspaceId} and revision > 1 and fresh_at > now() - interval '24 hours' and day >= ${p.from} and day <= ${p.to}`);
  const row = (r as unknown as { count: number; from: string | null; to: string | null }[])[0];
  return { count: Number(row?.count ?? 0), from: row?.from ?? null, to: row?.to ?? null };
}

export type Freshness = { latestAt: Date | null; staleChannels: { name: string; network: string; lastSuccessAt: Date | null; lastError: string | null }[] };
export async function freshness(workspaceId: string): Promise<Freshness> {
  const rows = await db.execute(sql`select c.name, c.network, s.last_success_at, s.last_error from channel c left join sync_cursor s on s.channel_id = c.id and s.resource = 'insights' where c.workspace_id = ${workspaceId} and c.status in ('healthy','degraded')`);
  const list = (rows as unknown as { name: string; network: string; last_success_at: Date | null; last_error: string | null }[]).map((r) => ({ name: r.name, network: r.network, lastSuccessAt: r.last_success_at ? new Date(r.last_success_at) : null, lastError: r.last_error }));
  const latest = list.reduce<Date | null>((m, r) => (r.lastSuccessAt && (!m || r.lastSuccessAt > m) ? r.lastSuccessAt : m), null);
  const cutoff = Date.now() - 36 * 3_600_000;
  return { latestAt: latest, staleChannels: list.filter((r) => !r.lastSuccessAt || r.lastSuccessAt.getTime() < cutoff || r.lastError) };
}
