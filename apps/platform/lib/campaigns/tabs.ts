/* Content, Audience, Conversations and Activity tab loaders for campaign detail. */
import { and, desc, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema/auth";
import { adSet, adCampaign, campaignContent, campaignEvent } from "@/db/schema/campaigns";
import { channel } from "@/db/schema/connections";
import { contentItem, postVariant, remotePublication } from "@/db/schema/content";
import { contact, conversation } from "@/db/schema/engagement";
import type { AnalyticsFilters } from "@/lib/analytics/periods";
import { seriesByNetwork } from "@/lib/analytics/queries";
import { relativeLabel } from "@/lib/engagement/format";
import { formatInZone } from "@/lib/time";

export type ContentRow = { id: string; title: string; status: string; networks: string[]; when: string | null; addedBy: string | null; reach: number | null; engagement: number | null };
export type AttachableItem = { id: string; title: string; status: string };

export async function contentTab(workspaceId: string, campaignId: string, tz: string): Promise<{ rows: ContentRow[]; attachable: AttachableItem[] }> {
  const rows = (await db.execute(sql`
    select ci.id, ci.title, ci.status, ci.scheduled_at, u.name as added_by,
      (select array_agg(distinct ch.network) from post_variant pv join channel ch on ch.id = pv.channel_id where pv.content_item_id = ci.id) as networks,
      (select max(pv.published_at) from post_variant pv where pv.content_item_id = ci.id) as published_at,
      (select sum(f.value)::float from metric_fact f where f.entity = 'post' and f.metric = 'reach' and f.remote_id in (select rp.remote_id from post_variant pv join remote_publication rp on rp.variant_id = pv.id where pv.content_item_id = ci.id)) as reach,
      (select sum(f.value)::float from metric_fact f where f.entity = 'post' and f.metric in ('reactions','comments','shares','saves') and f.remote_id in (select rp.remote_id from post_variant pv join remote_publication rp on rp.variant_id = pv.id where pv.content_item_id = ci.id)) as engagement
    from campaign_content cc join content_item ci on ci.id = cc.content_item_id left join "user" u on u.id = cc.added_by_user_id
    where cc.campaign_id = ${campaignId} and ci.deleted_at is null order by coalesce(ci.scheduled_at, ci.created_at) desc`)) as unknown as Record<string, unknown>[];
  const attached = await db.select({ id: campaignContent.contentItemId }).from(campaignContent).where(eq(campaignContent.campaignId, campaignId));
  const attachable = await db.select({ id: contentItem.id, title: contentItem.title, status: contentItem.status }).from(contentItem).where(and(eq(contentItem.workspaceId, workspaceId), isNull(contentItem.deletedAt), attached.length ? notInArray(contentItem.id, attached.map((a) => a.id)) : sql`true`)).orderBy(desc(contentItem.updatedAt)).limit(50);
  return {
    rows: rows.map((r) => ({ id: String(r.id), title: String(r.title), status: String(r.status), networks: (r.networks as string[] | null) ?? [], when: r.published_at ? formatInZone(new Date(r.published_at as string), tz) : r.scheduled_at ? `Scheduled ${formatInZone(new Date(r.scheduled_at as string), tz)}` : null, addedBy: (r.added_by as string | null) ?? null, reach: r.reach == null ? null : Number(r.reach), engagement: r.engagement == null ? null : Number(r.engagement) })),
    attachable,
  };
}

export type AudienceData = { reachByNetwork: { network: string; value: number }[]; targeting: { adCampaign: string; summary: string }[]; unavailable: { channel: string; network: string; reason: string }[] };

/** Only what providers give: reach per network (organic + paid facts) and imported ad set targeting; demographics are reported as unavailable per channel. */
export async function audienceTab(workspaceId: string, campaignId: string, filters: AnalyticsFilters): Promise<AudienceData> {
  const f = { ...filters, campaignId };
  const [series, sets, channels] = await Promise.all([
    seriesByNetwork(workspaceId, f, f, "reach"),
    db.select({ name: adCampaign.name, summary: adSet.targetingSummary }).from(adSet).innerJoin(adCampaign, eq(adCampaign.id, adSet.adCampaignId)).where(and(eq(adCampaign.campaignId, campaignId), eq(adSet.workspaceId, workspaceId))),
    db.select({ name: channel.name, network: channel.network, capabilities: channel.capabilities }).from(channel).where(and(eq(channel.workspaceId, workspaceId), inArray(channel.status, ["healthy", "degraded"]))),
  ]);
  const byNet = new Map<string, number>();
  for (const p of series) byNet.set(p.network, (byNet.get(p.network) ?? 0) + p.value);
  return {
    reachByNetwork: [...byNet.entries()].map(([network, value]) => ({ network, value })).sort((a, b) => b.value - a.value),
    targeting: sets.filter((s) => s.summary).map((s) => ({ adCampaign: s.name, summary: s.summary! })),
    unavailable: channels.map((c) => ({ channel: c.name, network: c.network, reason: c.capabilities.insights.audience ? "Audience demographics are not imported yet; only reach and ad targeting are shown." : `${c.name} does not expose audience insights (${c.capabilities.reasons?.audience ?? "provider limitation"}).` })),
  };
}

export type CampaignConversationRow = { id: string; kind: string; status: string; preview: string; contact: string; channel: { name: string; network: string }; lastAt: string; postUrl: string | null };

/** Inbox threads on the campaign's published posts (post_remote_id ∈ campaign publications). */
export async function conversationsTab(workspaceId: string, campaignId: string, tz: string): Promise<CampaignConversationRow[]> {
  const posts = db.select({ id: remotePublication.remoteId }).from(remotePublication).innerJoin(postVariant, eq(postVariant.id, remotePublication.variantId)).innerJoin(campaignContent, eq(campaignContent.contentItemId, postVariant.contentItemId)).where(eq(campaignContent.campaignId, campaignId));
  const rows = await db.select({ c: conversation, contact: contact.displayName, ch: { name: channel.name, network: channel.network } }).from(conversation).innerJoin(contact, eq(contact.id, conversation.contactId)).innerJoin(channel, eq(channel.id, conversation.channelId)).where(and(eq(conversation.workspaceId, workspaceId), inArray(conversation.postRemoteId, posts))).orderBy(desc(conversation.lastMessageAt)).limit(50);
  const now = Date.now();
  return rows.map(({ c, contact: name, ch }) => ({ id: c.id, kind: c.kind, status: c.status, preview: c.preview, contact: name, channel: ch, lastAt: relativeLabel(c.lastMessageAt, tz, now), postUrl: c.postUrl }));
}

export type ActivityRow = { id: string; kind: string; actor: string | null; at: string; data: Record<string, unknown> };

export async function activityTab(campaignId: string, tz: string): Promise<ActivityRow[]> {
  const rows = await db.select({ e: campaignEvent, actor: user.name }).from(campaignEvent).leftJoin(user, eq(user.id, campaignEvent.actorUserId)).where(eq(campaignEvent.campaignId, campaignId)).orderBy(desc(campaignEvent.createdAt)).limit(100);
  return rows.map(({ e, actor }) => ({ id: e.id, kind: e.kind, actor, at: formatInZone(e.createdAt, tz), data: e.data }));
}
