/*
 * Per-post performance for the post detail screen: the post-level facts stored
 * for each remote publication, with the freshness stamp the metric contract
 * requires. No estimates — a channel with no facts yet reads as "no data".
 */
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { DEFINITIONS_VERSION } from "./metrics";

export type PublicationPerformance = {
  channelId: string;
  channelName: string;
  network: string;
  remoteId: string;
  url: string | null;
  publishedAt: Date;
  reach: number;
  impressions: number;
  engagement: number;
  clicks: number;
  hasFacts: boolean;
  freshAt: Date | null;
};

export type PostPerformance = {
  rows: PublicationPerformance[];
  totals: { reach: number; impressions: number; engagement: number; clicks: number; rate: number | null };
  freshAt: Date | null;
  definitionsVersion: string;
};

type Row = { channel_id: string; channel_name: string; network: string; remote_id: string; url: string | null; published_at: string; reach: number; impressions: number; engagement: number; clicks: number; facts: number; fresh_at: string | null };

/** Facts for every remote publication of one content item. */
export async function postPerformance(workspaceId: string, contentItemId: string): Promise<PostPerformance> {
  const raw = await db.execute(sql`
    select rp.channel_id, c.name as channel_name, c.network, rp.remote_id, rp.url, rp.published_at,
      coalesce(sum(mf.value) filter (where mf.metric = 'reach'), 0)::float as reach,
      coalesce(sum(mf.value) filter (where mf.metric = 'impressions'), 0)::float as impressions,
      coalesce(
        sum(mf.value) filter (where mf.metric = 'engagement'),
        sum(mf.value) filter (where mf.metric in ('reactions','comments','shares','saves')),
        0)::float as engagement,
      coalesce(sum(mf.value) filter (where mf.metric = 'link_clicks'), 0)::float as clicks,
      count(mf.id)::int as facts, max(mf.fresh_at) as fresh_at
    from remote_publication rp
      join post_variant pv on pv.id = rp.variant_id
      join channel c on c.id = rp.channel_id
      left join metric_fact mf on mf.channel_id = rp.channel_id and mf.remote_id = rp.remote_id and mf.entity = 'post'
    where pv.content_item_id = ${contentItemId} and pv.workspace_id = ${workspaceId}
    group by rp.channel_id, c.name, c.network, rp.remote_id, rp.url, rp.published_at
    order by rp.published_at`);
  const rows = (raw as unknown as Row[]).map<PublicationPerformance>((r) => ({
    channelId: r.channel_id, channelName: r.channel_name, network: r.network, remoteId: r.remote_id, url: r.url,
    publishedAt: new Date(r.published_at), reach: Number(r.reach), impressions: Number(r.impressions), engagement: Number(r.engagement), clicks: Number(r.clicks),
    hasFacts: Number(r.facts) > 0, freshAt: r.fresh_at ? new Date(r.fresh_at) : null,
  }));
  const add = (k: "reach" | "impressions" | "engagement" | "clicks") => rows.reduce((n, r) => n + r[k], 0);
  const totals = { reach: add("reach"), impressions: add("impressions"), engagement: add("engagement"), clicks: add("clicks"), rate: null as number | null };
  totals.rate = totals.reach > 0 ? totals.engagement / totals.reach : null;
  const freshAt = rows.reduce<Date | null>((m, r) => (r.freshAt && (!m || r.freshAt > m) ? r.freshAt : m), null);
  return { rows, totals, freshAt, definitionsVersion: DEFINITIONS_VERSION };
}
