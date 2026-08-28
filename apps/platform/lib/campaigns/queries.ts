import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { workspaceMembership } from "@/db/schema/app";
import { user } from "@/db/schema/auth";
import type { CampaignObjective, CampaignStatus } from "@/db/schema/campaigns";
import { dateLabel } from "./format";

export type CampaignListRow = {
  id: string; name: string; objective: CampaignObjective; status: CampaignStatus; archived: boolean;
  start: string | null; end: string | null; owner: string | null; networks: string[]; contentCount: number;
  spend: number | null; currency: string; conversions: number | null; engagement: number | null; alerts: string[];
};

type Agg = {
  id: string; name: string; objective: CampaignObjective; status: CampaignStatus; archived_at: Date | null; start_at: Date | null; end_at: Date | null; currency: string; owner: string | null;
  content_count: number; networks: string[] | null; spend: number | null; conversions: number | null; engagement: number | null; rejected: number; sync_errors: number;
};

/** Every campaign with the deterministic roll-ups the list shows (pages.md "Campaigns"). */
export async function listCampaigns(workspaceId: string, tz: string, archived = false): Promise<CampaignListRow[]> {
  const rows = (await db.execute(sql`
    select c.id, c.name, c.objective, c.status, c.archived_at, c.start_at, c.end_at, c.currency, u.name as owner,
      (select count(*)::int from campaign_content cc where cc.campaign_id = c.id) as content_count,
      (select array_agg(distinct ch.network) from campaign_content cc join post_variant pv on pv.content_item_id = cc.content_item_id join channel ch on ch.id = pv.channel_id where cc.campaign_id = c.id) as networks,
      (select sum(value)::float from metric_fact f where f.scope = 'paid' and f.entity = 'channel' and f.metric = 'spend' and f.remote_id in (select remote_id from ad_campaign a where a.campaign_id = c.id)) as spend,
      (select sum(value)::float from metric_fact f where f.scope = 'paid' and f.entity = 'channel' and f.metric = 'conversions' and f.remote_id in (select remote_id from ad_campaign a where a.campaign_id = c.id)) as conversions,
      (select sum(value)::float from metric_fact f where f.entity = 'post' and f.metric in ('reactions','comments','shares','saves') and f.remote_id in (select rp.remote_id from campaign_content cc join post_variant pv on pv.content_item_id = cc.content_item_id join remote_publication rp on rp.variant_id = pv.id where cc.campaign_id = c.id)) as engagement,
      (select count(*)::int from ad_campaign a where a.campaign_id = c.id and a.status = 'rejected') as rejected,
      (select count(*)::int from ad_campaign a join ad_account aa on aa.id = a.ad_account_id where a.campaign_id = c.id and aa.last_error is not null) as sync_errors
    from campaign c left join "user" u on u.id = c.owner_user_id
    where c.workspace_id = ${workspaceId} and ${archived ? sql`c.archived_at is not null` : sql`c.archived_at is null`}
    order by case c.status when 'active' then 0 when 'paused' then 1 when 'draft' then 2 else 3 end, c.start_at desc nulls last, c.name`)) as unknown as Agg[];
  const now = Date.now();
  return rows.map((r) => {
    const alerts: string[] = [];
    if (!r.content_count) alerts.push("No content attached");
    if (r.rejected) alerts.push(`${r.rejected} ad campaign${r.rejected > 1 ? "s" : ""} rejected`);
    if (r.sync_errors) alerts.push("Ad import degraded");
    if (r.end_at && r.status === "active" && new Date(r.end_at).getTime() - now < 3 * 86_400_000 && new Date(r.end_at).getTime() > now) alerts.push("Ends within 3 days");
    if (r.status === "active" && r.end_at && new Date(r.end_at).getTime() < now) alerts.push("Past end date, still active");
    return {
      id: r.id, name: r.name, objective: r.objective, status: r.status, archived: !!r.archived_at, start: dateLabel(r.start_at ? new Date(r.start_at) : null, tz), end: dateLabel(r.end_at ? new Date(r.end_at) : null, tz), owner: r.owner,
      networks: r.networks ?? [], contentCount: r.content_count, spend: r.spend == null ? null : Number(r.spend), currency: r.currency, conversions: r.conversions == null ? null : Number(r.conversions), engagement: r.engagement == null ? null : Number(r.engagement), alerts,
    };
  });
}

export async function workspaceMembers(workspaceId: string) {
  return db.select({ id: user.id, name: user.name }).from(workspaceMembership).innerJoin(user, eq(user.id, workspaceMembership.userId)).where(eq(workspaceMembership.workspaceId, workspaceId)).orderBy(user.name);
}
