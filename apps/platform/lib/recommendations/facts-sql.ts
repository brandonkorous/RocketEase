/*
 * Raw fact queries for the recommendation engine. Kept apart from facts.ts so
 * the SQL is readable and every row shape is declared once.
 */
import { sql } from "drizzle-orm";
import { db } from "@/db";

/** Trailing analysis window (days) for post-level and daily facts. */
export const WINDOW_DAYS = 90;

const rows = async <T>(q: ReturnType<typeof sql>) => (await db.execute(q)) as unknown as T[];

export type ChannelRow = { id: string; name: string; network: string };
export const channelRows = (workspaceId: string) =>
  rows<ChannelRow>(sql`select id, name, network from channel where workspace_id = ${workspaceId} and status in ('healthy','degraded') order by name`);

export type PostRow = { item_id: string; title: string; remote_id: string; channel_id: string; published_at: string; format: string; reach: number; engagement: number; clicks: number };

/**
 * One row per published post with its organic post-level facts. Engagement uses
 * the provider total when it reports one, else the sum of its parts (derive.ts).
 */
export const postRows = (workspaceId: string, from: string) =>
  rows<PostRow>(sql`
    select ci.id as item_id, ci.title, rp.remote_id, rp.channel_id, rp.published_at, pv.format,
      coalesce(sum(mf.value) filter (where mf.metric = 'reach'), 0)::float as reach,
      coalesce(
        sum(mf.value) filter (where mf.metric = 'engagement'),
        sum(mf.value) filter (where mf.metric in ('reactions','comments','shares','saves')),
        0)::float as engagement,
      coalesce(sum(mf.value) filter (where mf.metric = 'link_clicks'), 0)::float as clicks
    from remote_publication rp
      join post_variant pv on pv.id = rp.variant_id
      join content_item ci on ci.id = pv.content_item_id
      left join metric_fact mf on mf.channel_id = rp.channel_id and mf.remote_id = rp.remote_id and mf.entity = 'post' and mf.scope = 'organic'
    where pv.workspace_id = ${workspaceId} and rp.state = 'published' and ci.deleted_at is null
      and rp.published_at >= ${`${from}T00:00:00Z`}::timestamptz
    group by ci.id, ci.title, rp.remote_id, rp.channel_id, rp.published_at, pv.format`);

export type DailyRow = { channel_id: string; metric: string; day: string; value: number };
export const channelDailyRows = (workspaceId: string, from: string) =>
  rows<DailyRow>(sql`
    select channel_id, metric, day, sum(value)::float as value
    from metric_fact
    where workspace_id = ${workspaceId} and entity = 'channel' and scope = 'organic' and day >= ${from}
      and metric in ('reach','engagement','follower_gain','reactions','comments','shares','saves')
    group by channel_id, metric, day`);

export type InboxRow = { open: number; unanswered: number; overdue: number; median_minutes: number | null; answered: number; target_minutes: number | null };

/** Open load now, plus first-reply time over the same window as the other facts. */
export const inboxRow = async (workspaceId: string) =>
  (
    await rows<InboxRow>(sql`
      select
        (select count(*) from conversation where workspace_id = ${workspaceId} and status <> 'resolved')::int as open,
        (select count(*) from conversation where workspace_id = ${workspaceId} and status <> 'resolved' and last_outbound_at is null)::int as unanswered,
        (select count(*) from conversation where workspace_id = ${workspaceId} and status = 'open' and first_response_at is null and response_due_at is not null and response_due_at < now())::int as overdue,
        (select percentile_cont(0.5) within group (order by extract(epoch from (first_response_at - created_at)) / 60)
           from conversation where workspace_id = ${workspaceId} and first_response_at is not null
             and created_at >= now() - make_interval(days => ${WINDOW_DAYS}::int)) as median_minutes,
        (select count(*) from conversation where workspace_id = ${workspaceId} and first_response_at is not null
           and created_at >= now() - make_interval(days => ${WINDOW_DAYS}::int))::int as answered,
        (select first_response_target_minutes from inbox_settings where workspace_id = ${workspaceId}) as target_minutes`)
  )[0];
