/*
 * Paid import helpers shared by the ads.sync worker. Worker-safe: no
 * server-only / next/headers imports. Paid facts land in metric_fact with
 * scope = paid — campaign-level rows are keyed by the ad campaign's remote id
 * under entity "channel"; boosted-post rows under entity "post".
 */
import { and, eq, sql } from "drizzle-orm";
import type { AdAccountDescriptor, CanonicalMetric, PaidInsightsPage, PaidObjects } from "@rocketease/providers";
import { db } from "@/db";
import { metricFact } from "@/db/schema/analytics";
import { adCampaign, adCreative, adSet, promotion, type AdAccount } from "@/db/schema/campaigns";

const num = (v: number | undefined) => (v == null ? null : String(v));
const at = (v: string | undefined) => (v ? new Date(v) : null);

export const toAccountDescriptor = (a: AdAccount): AdAccountDescriptor => ({ remoteId: a.remoteId, name: a.name, currency: a.currency, timezone: a.timezone ?? undefined, status: a.status, managerUrl: a.managerUrl ?? undefined });

/** Upsert campaigns → ad sets → ads; links objects back to the promotion that created them. */
export async function upsertPaidObjects(account: AdAccount, objects: PaidObjects) {
  const promos = await db.select().from(promotion).where(and(eq(promotion.adAccountId, account.id), eq(promotion.status, "created")));
  const byCampaign = new Map(promos.map((p) => [p.campaignRemoteId, p]));
  const byAd = new Map(promos.map((p) => [p.adRemoteId, p]));
  const campaignIds = new Map<string, string>();
  for (const c of objects.campaigns) {
    const p = byCampaign.get(c.remoteId);
    const values = { organizationId: account.organizationId, workspaceId: account.workspaceId, adAccountId: account.id, remoteId: c.remoteId, name: c.name, objective: c.objective ?? null, status: c.status, dailyBudget: num(c.dailyBudget), lifetimeBudget: num(c.lifetimeBudget), currency: account.currency, startAt: at(c.startAt), endAt: at(c.endAt), managerUrl: c.managerUrl ?? null, lastSeenAt: new Date(), updatedAt: new Date() };
    const [row] = await db
      .insert(adCampaign)
      .values({ ...values, promotionId: p?.id ?? null, campaignId: p?.campaignId ?? null })
      .onConflictDoUpdate({ target: [adCampaign.adAccountId, adCampaign.remoteId], set: { ...values, promotionId: sql`coalesce(${adCampaign.promotionId}, ${p?.id ?? null})`, campaignId: sql`coalesce(${adCampaign.campaignId}, ${p?.campaignId ?? null})` } })
      .returning({ id: adCampaign.id });
    campaignIds.set(c.remoteId, row.id);
  }
  const setIds = new Map<string, string>();
  for (const s of objects.adSets) {
    const adCampaignId = campaignIds.get(s.campaignRemoteId);
    if (!adCampaignId) continue;
    const values = { workspaceId: account.workspaceId, adCampaignId, remoteId: s.remoteId, name: s.name, status: s.status, dailyBudget: num(s.dailyBudget), lifetimeBudget: num(s.lifetimeBudget), targetingSummary: s.targetingSummary ?? null, startAt: at(s.startAt), endAt: at(s.endAt), updatedAt: new Date() };
    const [row] = await db.insert(adSet).values(values).onConflictDoUpdate({ target: [adSet.adCampaignId, adSet.remoteId], set: values }).returning({ id: adSet.id });
    setIds.set(s.remoteId, row.id);
  }
  for (const a of objects.ads) {
    const adCampaignId = campaignIds.get(a.campaignRemoteId);
    if (!adCampaignId) continue;
    const values = { workspaceId: account.workspaceId, adCampaignId, adSetId: setIds.get(a.adSetRemoteId) ?? null, remoteId: a.remoteId, name: a.name, status: a.status, promotedPostRemoteId: a.promotedPostRemoteId ?? null, promotedVariantId: byAd.get(a.remoteId)?.variantId ?? null, previewUrl: a.previewUrl ?? null, thumbnailUrl: a.thumbnailUrl ?? null, updatedAt: new Date() };
    await db.insert(adCreative).values(values).onConflictDoUpdate({ target: [adCreative.adCampaignId, adCreative.remoteId], set: values });
  }
  return { campaigns: campaignIds.size, adSets: setIds.size, ads: objects.ads.length };
}

type FactRow = { entity: "channel" | "post"; remoteId: string; metric: CanonicalMetric; day: string; value: number; source: string };

/** Campaign facts as-is; ad facts roll up onto the organic post they boost. */
function toRows(page: PaidInsightsPage, postByAd: Map<string, string>): FactRow[] {
  const rows = new Map<string, FactRow>();
  for (const f of page.facts) {
    const row: FactRow | null = f.entity === "campaign" ? { entity: "channel", remoteId: f.remoteId, metric: f.metric, day: f.day, value: f.value, source: f.source } : postByAd.has(f.remoteId) ? { entity: "post", remoteId: postByAd.get(f.remoteId)!, metric: f.metric, day: f.day, value: f.value, source: f.source } : null;
    if (!row) continue;
    const key = `${row.entity}:${row.remoteId}:${row.metric}:${row.day}`;
    const prev = rows.get(key);
    if (prev) prev.value += row.value;
    else rows.set(key, row);
  }
  return [...rows.values()];
}

/** Upsert paid facts (scope = paid). A changed value bumps revision like organic ingest. */
export async function upsertPaidFacts(account: AdAccount & { channelId: string }, page: PaidInsightsPage, postByAd: Map<string, string>) {
  let inserted = 0;
  let revised = 0;
  for (const f of toRows(page, postByAd)) {
    const v = String(Math.round(f.value * 100) / 100);
    const [row] = await db
      .insert(metricFact)
      .values({ organizationId: account.organizationId, workspaceId: account.workspaceId, channelId: account.channelId, entity: f.entity, remoteId: f.remoteId, metric: f.metric, day: f.day, value: v, scope: "paid", source: `${f.source}@${page.currency}` })
      .onConflictDoUpdate({
        target: [metricFact.channelId, metricFact.entity, metricFact.remoteId, metricFact.metric, metricFact.day, metricFact.scope],
        set: { value: v, source: `${f.source}@${page.currency}`, freshAt: new Date(), revision: sql`case when ${metricFact.value} <> ${v}::numeric then ${metricFact.revision} + 1 else ${metricFact.revision} end` },
      })
      .returning({ revision: metricFact.revision, created: sql<boolean>`(xmax = 0)` });
    if (row?.created) inserted++;
    else if (row && row.revision > 1) revised++;
  }
  return { inserted, revised };
}
