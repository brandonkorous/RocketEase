/* Ads tab data (images/ads.png inside campaign detail): accounts, imported ad campaigns, promotion candidates. */
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { AdAccountDescriptor } from "@rocketease/providers";
import { db } from "@/db";
import { adAccount, adCampaign, campaign as campaignTable, promotion, type Campaign } from "@/db/schema/campaigns";
import { channel } from "@/db/schema/connections";
import { contentItem, postVariant } from "@/db/schema/content";
import { paidRatio } from "@/lib/analytics/metrics";
import type { AnalyticsFilters } from "@/lib/analytics/periods";
import { getAdapter, loadCredential } from "@/lib/providers";
import { formatInZone } from "@/lib/time";
import { paidAttribution, type PaidAttribution } from "./attribution";
import { campaignPerformance, type CampaignCard } from "./performance";
import { formatMoney } from "./format";

export type AdAccountRow = { id: string; name: string; provider: string; network: string | null; currency: string; status: string; managerUrl: string | null; lastSync: string | null; lastError: string | null };
export type AvailableAccounts = { connectionId: string; provider: string; providerName: string; accounts: AdAccountDescriptor[]; error?: string };
export type AdCampaignRow = { id: string; name: string; network: string | null; accountName: string; currency: string; objective: string | null; status: string; linked: { id: string; name: string } | null; budget: string; spend: number | null; impressions: number | null; clicks: number | null; conversions: number | null; cpm: number | null; cpc: number | null; ctr: number | null; managerUrl: string | null; fromPromotion: boolean; canToggle: boolean };
export type EligiblePost = { variantId: string; title: string; text: string; channel: { id: string; name: string; network: string }; url: string | null; publishedAt: string; accounts: { id: string; name: string; currency: string }[]; blocked: string | null };
export type PromotionRow = { id: string; name: string; status: string; budget: string; account: string; at: string; error: string | null; managerUrl: string | null };
export type AdsData = { accounts: AdAccountRow[]; available: AvailableAccounts[] | null; adCampaigns: AdCampaignRow[]; showAll: boolean; eligible: EligiblePost[]; promotions: PromotionRow[]; cards: CampaignCard[]; attribution: PaidAttribution | null; campaigns: { id: string; name: string }[] };

const num = (v: unknown) => (v == null ? null : Number(v));

async function accountRows(workspaceId: string, tz: string): Promise<AdAccountRow[]> {
  const rows = await db.select({ a: adAccount, network: channel.network }).from(adAccount).leftJoin(channel, eq(channel.id, adAccount.channelId)).where(and(eq(adAccount.workspaceId, workspaceId), isNull(adAccount.disconnectedAt))).orderBy(adAccount.name);
  return rows.map(({ a, network }) => ({ id: a.id, name: a.name, provider: a.provider, network, currency: a.currency, status: a.status, managerUrl: a.managerUrl, lastSync: a.lastSyncAt ? formatInZone(a.lastSyncAt, tz) : null, lastError: a.lastError }));
}

/** Ad accounts each active connection can read — only fetched when the user opens the picker (provider calls). */
async function availableAccounts(workspaceId: string, connected: Set<string>): Promise<AvailableAccounts[]> {
  const conns = await db.query.providerConnection.findMany({ where: (c, { and, eq }) => and(eq(c.workspaceId, workspaceId), eq(c.status, "active")) });
  const out: AvailableAccounts[] = [];
  for (const conn of conns) {
    const adapter = getAdapter(conn.provider);
    if (!adapter.listAdAccounts) continue;
    try {
      const accounts = (await adapter.listAdAccounts(await loadCredential(conn))).filter((a) => !connected.has(`${conn.provider}:${a.remoteId}`));
      out.push({ connectionId: conn.id, provider: conn.provider, providerName: adapter.displayName, accounts });
    } catch (err) {
      out.push({ connectionId: conn.id, provider: conn.provider, providerName: adapter.displayName, accounts: [], error: err instanceof Error ? err.message : String(err) });
    }
  }
  return out;
}

async function adCampaignRows(workspaceId: string, campaignId: string | null, f: AnalyticsFilters, showAll: boolean): Promise<AdCampaignRow[]> {
  const rows = (await db.execute(sql`
    select a.id, a.name, a.objective, a.status, a.daily_budget, a.lifetime_budget, a.currency, a.manager_url, a.promotion_id, a.campaign_id, aa.name as account_name, aa.provider, ch.network, c.name as campaign_name,
      sum(f.value) filter (where f.metric = 'spend')::float as spend, sum(f.value) filter (where f.metric = 'impressions')::float as impressions,
      sum(f.value) filter (where f.metric = 'link_clicks')::float as clicks, sum(f.value) filter (where f.metric = 'conversions')::float as conversions
    from ad_campaign a join ad_account aa on aa.id = a.ad_account_id left join channel ch on ch.id = aa.channel_id left join campaign c on c.id = a.campaign_id
    left join metric_fact f on f.channel_id = aa.channel_id and f.scope = 'paid' and f.entity = 'channel' and f.remote_id = a.remote_id and f.day between ${f.from} and ${f.to}
    where a.workspace_id = ${workspaceId} and aa.disconnected_at is null ${campaignId && !showAll ? sql`and a.campaign_id = ${campaignId}` : sql``}
    group by a.id, aa.name, aa.provider, ch.network, c.name order by spend desc nulls last, a.name`)) as unknown as Record<string, unknown>[];
  return rows.map((r) => {
    const t = { spend: num(r.spend) ?? undefined, impressions: num(r.impressions) ?? undefined, link_clicks: num(r.clicks) ?? undefined, conversions: num(r.conversions) ?? undefined };
    const budget = r.daily_budget ? `${formatMoney(Number(r.daily_budget), String(r.currency))}/day` : r.lifetime_budget ? `${formatMoney(Number(r.lifetime_budget), String(r.currency))} lifetime` : "—";
    return { id: String(r.id), name: String(r.name), network: (r.network as string | null) ?? null, accountName: String(r.account_name), currency: String(r.currency), objective: (r.objective as string | null) ?? null, status: String(r.status), linked: r.campaign_id ? { id: String(r.campaign_id), name: String(r.campaign_name) } : null, budget, spend: t.spend ?? null, impressions: t.impressions ?? null, clicks: t.link_clicks ?? null, conversions: t.conversions ?? null, cpm: paidRatio("cpm", t), cpc: paidRatio("cpc", t), ctr: paidRatio("ctr_paid", t), managerUrl: (r.manager_url as string | null) ?? null, fromPromotion: !!r.promotion_id, canToggle: !!getAdapter(String(r.provider)).setPaidObjectStatus && ["active", "paused"].includes(String(r.status)) };
  });
}

/** Published variants that could be boosted, with the reason when they can't (CAM-002 eligibility). */
async function eligiblePosts(workspaceId: string, campaignId: string | null, accounts: AdAccountRow[], tz: string): Promise<EligiblePost[]> {
  const inCampaign = campaignId ? sql`${postVariant.contentItemId} in (select content_item_id from campaign_content where campaign_id = ${campaignId})` : sql`true`;
  const rows = await db.select({ v: postVariant, item: { title: contentItem.title, text: contentItem.sharedText }, ch: channel }).from(postVariant).innerJoin(contentItem, eq(contentItem.id, postVariant.contentItemId)).innerJoin(channel, eq(channel.id, postVariant.channelId)).where(and(eq(postVariant.workspaceId, workspaceId), eq(postVariant.status, "published"), inCampaign)).orderBy(desc(postVariant.publishedAt)).limit(20);
  return rows.map(({ v, item, ch }) => {
    const acc = accounts.filter((a) => a.provider === ch.provider && a.status === "active").map((a) => ({ id: a.id, name: a.name, currency: a.currency }));
    const blocked = !["healthy", "degraded"].includes(ch.status) ? "Channel needs reconnecting." : !ch.capabilities.ads.manage ? (ch.capabilities.reasons?.ads ?? `${ch.name} does not allow promotions from RocketEase.`) : !getAdapter(ch.provider).promote ? "This network only supports read-only ad import." : acc.length ? null : `Connect a ${ch.provider === "mock" ? "demo" : ch.provider} ad account first.`;
    return { variantId: v.id, title: item.title, text: (v.textOverride ?? item.text).slice(0, 140), channel: { id: ch.id, name: ch.name, network: ch.network }, url: v.remoteUrl, publishedAt: v.publishedAt ? formatInZone(v.publishedAt, tz) : "", accounts: acc, blocked };
  });
}

async function promotionRows(workspaceId: string, campaignId: string | null, tz: string): Promise<PromotionRow[]> {
  const rows = await db.select({ p: promotion, account: adAccount.name }).from(promotion).innerJoin(adAccount, eq(adAccount.id, promotion.adAccountId)).where(and(eq(promotion.workspaceId, workspaceId), campaignId ? eq(promotion.campaignId, campaignId) : sql`true`)).orderBy(desc(promotion.createdAt)).limit(20);
  return rows.map(({ p, account }) => ({ id: p.id, name: p.request.name, status: p.status, budget: `${formatMoney(p.request.budget.amount, p.request.budget.currency)}${p.request.budget.kind === "daily" ? "/day" : " lifetime"}`, account, at: formatInZone(p.createdAt, tz), error: p.error, managerUrl: p.managerUrl }));
}

export async function loadAdsData(workspaceId: string, c: Campaign | null, filters: AnalyticsFilters, tz: string, opts: { connect: boolean; showAll: boolean }): Promise<AdsData> {
  const accounts = await accountRows(workspaceId, tz);
  const connected = new Set<string>();
  const ids = await db.select({ provider: adAccount.provider, remoteId: adAccount.remoteId }).from(adAccount).where(and(eq(adAccount.workspaceId, workspaceId), isNull(adAccount.disconnectedAt)));
  for (const r of ids) connected.add(`${r.provider}:${r.remoteId}`);
  const [available, adCampaigns, eligible, promotions, perf, attribution, campaigns] = await Promise.all([
    opts.connect ? availableAccounts(workspaceId, connected) : Promise.resolve(null),
    adCampaignRows(workspaceId, c?.id ?? null, filters, opts.showAll),
    eligiblePosts(workspaceId, c?.id ?? null, accounts, tz),
    promotionRows(workspaceId, c?.id ?? null, tz),
    c ? campaignPerformance(workspaceId, c.id, filters, ["spend", "roas", "conversions", "ctr_paid", "cpa"], tz) : Promise.resolve(null),
    paidAttribution(workspaceId, tz),
    db.select({ id: campaignTable.id, name: campaignTable.name }).from(campaignTable).where(and(eq(campaignTable.workspaceId, workspaceId), isNull(campaignTable.archivedAt), inArray(campaignTable.status, ["draft", "active", "paused"]))).orderBy(campaignTable.name),
  ]);
  return { accounts, available, adCampaigns, showAll: opts.showAll || !c, eligible, promotions, cards: perf?.cards ?? [], attribution, campaigns };
}
