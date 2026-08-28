/*
 * Reads every stored fact a rule may need, once per workspace. Nothing here
 * decides anything — it only assembles what metric_fact, remote_publication and
 * conversation already say, resolved into the workspace timezone.
 *
 * Worker-safe: no `server-only`, no `next/headers`.
 */
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { engagementOf } from "@/lib/analytics/derive";
import { dayKey } from "@/lib/time";
import { zonedSlot } from "./slot-format";
import { WINDOW_DAYS, channelDailyRows, channelRows, inboxRow, postRows, type ChannelRow, type DailyRow, type InboxRow, type PostRow } from "./facts-sql";
import type { ChannelFacts, DayFact, InboxFacts, PostFact, WorkspaceFacts } from "./types";

/** Daily channel series: engagement is the provider total, or the sum of its parts. */
function seriesOf(rows: DailyRow[], channelId: string): Pick<ChannelFacts, "reachByDay" | "engagementByDay" | "followerGainByDay"> {
  const byDay = new Map<string, Record<string, number>>();
  for (const r of rows) {
    if (r.channel_id !== channelId) continue;
    const bag = byDay.get(r.day) ?? {};
    bag[r.metric] = Number(r.value);
    byDay.set(r.day, bag);
  }
  const pick = (fn: (bag: Record<string, number>) => number | undefined): DayFact[] =>
    [...byDay].map(([day, bag]) => ({ day, value: fn(bag) ?? NaN })).filter((d) => Number.isFinite(d.value)).sort((a, b) => a.day.localeCompare(b.day));
  return {
    reachByDay: pick((b) => b.reach),
    engagementByDay: pick((b) => engagementOf(b)),
    followerGainByDay: pick((b) => b.follower_gain),
  };
}

function postsOf(rows: PostRow[], channelId: string, tz: string): PostFact[] {
  return rows
    .filter((r) => r.channel_id === channelId)
    .map((r) => {
      const publishedAt = new Date(r.published_at);
      const { day, weekday, hour } = zonedSlot(publishedAt, tz);
      return { itemId: r.item_id, title: r.title, remoteId: r.remote_id, channelId, publishedAt, day, weekday, hour, format: r.format, reach: Number(r.reach), engagement: Number(r.engagement), clicks: Number(r.clicks) };
    })
    .sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime());
}

function inboxOf(r: InboxRow | undefined): InboxFacts {
  return {
    open: Number(r?.open ?? 0),
    unanswered: Number(r?.unanswered ?? 0),
    overdue: Number(r?.overdue ?? 0),
    medianFirstResponseMinutes: r?.median_minutes == null ? null : Number(r.median_minutes),
    targetMinutes: r?.target_minutes == null ? null : Number(r.target_minutes),
    answeredSample: Number(r?.answered ?? 0),
  };
}

/** Every fact for one workspace over the trailing analysis window. */
export async function collectFacts(workspaceId: string): Promise<WorkspaceFacts | null> {
  const ws = await db.query.workspace.findFirst({ where: (w, { eq }) => eq(w.id, workspaceId) });
  if (!ws) return null;
  const tz = ws.timezone;
  const today = dayKey(new Date(), tz);
  // Facts land a day behind: the window ends yesterday, matching the analytics default.
  const to = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const from = new Date(Date.parse(`${to}T00:00:00Z`) - (WINDOW_DAYS - 1) * 86_400_000).toISOString().slice(0, 10);
  const [channels, posts, daily, inbox] = await Promise.all([channelRows(workspaceId), postRows(workspaceId, from), channelDailyRows(workspaceId, from), inboxRow(workspaceId)]);
  return {
    workspaceId,
    organizationId: ws.organizationId,
    timezone: tz,
    period: { from, to },
    today,
    channels: channels.map<ChannelFacts>((c: ChannelRow) => ({ channelId: c.id, name: c.name, network: c.network, posts: postsOf(posts, c.id, tz), ...seriesOf(daily, c.id) })),
    inbox: inboxOf(inbox),
  };
}

/** Workspaces worth computing for: those with at least one live channel. */
export async function workspacesToScore(): Promise<{ id: string; organizationId: string }[]> {
  const rows = await db.execute(sql`
    select w.id, w.organization_id from workspace w
    where w.archived_at is null and exists (select 1 from channel c where c.workspace_id = w.id and c.status in ('healthy','degraded'))`);
  return (rows as unknown as { id: string; organization_id: string }[]).map((r) => ({ id: r.id, organizationId: r.organization_id }));
}
