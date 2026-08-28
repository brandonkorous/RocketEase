import { and, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import type { CanonicalMetric } from "@make-it-social/providers";
import { db } from "@/db";
import { metricFact } from "@/db/schema/analytics";
import { channel } from "@/db/schema/connections";
import { contentItem, postVariant, remotePublication } from "@/db/schema/content";
import type { ReportFilters } from "@/db/schema/analytics";

export type Period = { from: string; to: string };
export type Totals = Partial<Record<CanonicalMetric, number>>;

const SUMMED: CanonicalMetric[] = ["impressions", "reach", "video_views", "reactions", "comments", "shares", "saves", "engagement", "link_clicks", "follower_gain"];

function scopeWhere(workspaceId: string, f: ReportFilters, p: Period, entity: "channel" | "post"): SQL {
  const parts = [eq(metricFact.workspaceId, workspaceId), eq(metricFact.entity, entity), gte(metricFact.day, p.from), lte(metricFact.day, p.to)];
  if (f.channelId) parts.push(eq(metricFact.channelId, f.channelId));
  if (f.scope !== "all") parts.push(eq(metricFact.scope, f.scope));
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

export type Freshness = { latestAt: Date | null; staleChannels: { name: string; network: string; lastSuccessAt: Date | null; lastError: string | null }[] };
export async function freshness(workspaceId: string): Promise<Freshness> {
  const rows = await db.execute(sql`select c.name, c.network, s.last_success_at, s.last_error from channel c left join sync_cursor s on s.channel_id = c.id and s.resource = 'insights' where c.workspace_id = ${workspaceId} and c.status in ('healthy','degraded')`);
  const list = (rows as unknown as { name: string; network: string; last_success_at: Date | null; last_error: string | null }[]).map((r) => ({ name: r.name, network: r.network, lastSuccessAt: r.last_success_at ? new Date(r.last_success_at) : null, lastError: r.last_error }));
  const latest = list.reduce<Date | null>((m, r) => (r.lastSuccessAt && (!m || r.lastSuccessAt > m) ? r.lastSuccessAt : m), null);
  const cutoff = Date.now() - 36 * 3_600_000;
  return { latestAt: latest, staleChannels: list.filter((r) => !r.lastSuccessAt || r.lastSuccessAt.getTime() < cutoff || r.lastError) };
}
