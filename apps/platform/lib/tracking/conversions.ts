/*
 * Read path for conversion facts.
 *
 * Site-reported conversions (GA4/Shopify/webhook) and ad-reported conversions
 * (metric_fact, scope = paid) are never summed for the same click: a row whose
 * utm_medium is a paid medium belongs to the paid scope, everything else to
 * organic. That keeps `conversions` additive across scopes with no overlap.
 * ROAS uses paid-medium revenue over paid spend.
 */
import { and, eq, gte, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { channel } from "@/db/schema/connections";
import { campaign } from "@/db/schema/campaigns";
import { conversionFact, trackingSource, type TrackingSource } from "@/db/schema/tracking";
import type { ReportFilters } from "@/db/schema/analytics";
import { PAID_MEDIUMS, sourceTokensForNetwork } from "./normalize";
import { KIND_LABEL, windowLabel } from "./labels";

export type ConversionTotals = { conversions?: number; revenue?: number; sessions?: number };
export type Period = { from: string; to: string };

const dim = (key: string) => sql`coalesce(${conversionFact.dimension}->>${sql.raw(`'${key}'`)}, '')`;
const list = (values: string[]) => sql.join(values.map((v) => sql`${v}`), sql`, `);
const paidMedium = () => sql`${dim("utm_medium")} in (${list(PAID_MEDIUMS)})`;

/** Channel and campaign filters resolved to the UTM values a source would have reported. */
async function filterTargets(workspaceId: string, f: ReportFilters) {
  const [ch] = f.channelId ? await db.select({ id: channel.id, network: channel.network }).from(channel).where(and(eq(channel.workspaceId, workspaceId), eq(channel.id, f.channelId))) : [];
  const [cp] = f.campaignId ? await db.select({ id: campaign.id, name: campaign.name, tracking: campaign.tracking }).from(campaign).where(and(eq(campaign.workspaceId, workspaceId), eq(campaign.id, f.campaignId))) : [];
  return {
    sourceTokens: ch ? sourceTokensForNetwork(ch.network) : null,
    channelId: ch?.id ?? null,
    utmCampaign: cp ? (cp.tracking.utmCampaign ?? cp.name).trim().toLowerCase() : null,
    campaignId: cp?.id ?? null,
  };
}

type Targets = Awaited<ReturnType<typeof filterTargets>>;

function scopeWhere(workspaceId: string, f: ReportFilters, p: Period, t: Targets): SQL {
  const parts: SQL[] = [eq(conversionFact.workspaceId, workspaceId), gte(conversionFact.day, p.from), lte(conversionFact.day, p.to)];
  if (t.sourceTokens) parts.push(or(sql`${dim("utm_source")} in (${list(t.sourceTokens.length ? t.sourceTokens : [""])})`, sql`${dim("channelId")} = ${t.channelId}`)!);
  if (t.utmCampaign !== null) parts.push(or(sql`${dim("utm_campaign")} = ${t.utmCampaign}`, sql`${dim("campaignId")} = ${t.campaignId}`)!);
  if (f.scope === "paid") parts.push(paidMedium());
  if (f.scope === "organic") parts.push(sql`not (${paidMedium()})`);
  return and(...parts)!;
}

/**
 * Site-reported totals for a period. Paid-medium conversions belong to the ad
 * platform in EVERY scope, so they are dropped here rather than added on top of
 * `metric_fact`; revenue and sessions are reported for whatever the scope selects.
 */
export async function conversionTotals(workspaceId: string, f: ReportFilters, p: Period): Promise<ConversionTotals> {
  const targets = await filterTargets(workspaceId, f);
  const rows = await db
    .select({ metric: conversionFact.metric, paid: sql<boolean>`${paidMedium()}`, v: sql<number>`sum(${conversionFact.value})::float` })
    .from(conversionFact)
    .where(scopeWhere(workspaceId, f, p, targets))
    .groupBy(sql`1, 2`);
  const out: ConversionTotals = {};
  for (const r of rows) {
    if (r.metric === "conversions" && r.paid) continue;
    out[r.metric] = (out[r.metric] ?? 0) + Number(r.v);
  }
  return out;
}

export type ConversionSourceView = { id: string; kind: TrackingSource["kind"]; kindLabel: string; name: string; status: TrackingSource["status"]; lastSyncAt: Date | null; window: string; message: string | null };
export type ConversionState = {
  sources: ConversionSourceView[];
  healthy: number;
  total: number;
  /** At least one source has ever reported non-zero revenue — gates ROAS. */
  hasRevenue: boolean;
  currencies: string[];
  lastSyncAt: Date | null;
};

const EMPTY_STATE: ConversionState = { sources: [], healthy: 0, total: 0, hasRevenue: false, currencies: [], lastSyncAt: null };

/** Which tracking sources this workspace has and how healthy they are (shown next to every conversion number). */
export async function conversionState(workspaceId: string): Promise<ConversionState> {
  const rows = await db.select().from(trackingSource).where(and(eq(trackingSource.workspaceId, workspaceId), isNull(trackingSource.disconnectedAt))).orderBy(trackingSource.createdAt);
  if (!rows.length) return EMPTY_STATE;
  const currencyRows = await db
    .selectDistinct({ currency: conversionFact.currency })
    .from(conversionFact)
    .where(and(eq(conversionFact.workspaceId, workspaceId), eq(conversionFact.metric, "revenue")));
  const sources = rows.map((s) => ({
    id: s.id,
    kind: s.kind,
    kindLabel: KIND_LABEL[s.kind],
    name: s.name,
    status: s.status,
    lastSyncAt: s.lastSyncAt,
    window: s.config.windowLabel ?? windowLabel(s.kind),
    message: s.status === "healthy" ? null : (s.health.message ?? s.lastError),
  }));
  return {
    sources,
    healthy: sources.filter((s) => s.status === "healthy").length,
    total: sources.length,
    hasRevenue: rows.some((s) => s.health.hasRevenue === true),
    currencies: currencyRows.map((c) => c.currency).filter((c): c is string => !!c),
    lastSyncAt: rows.reduce<Date | null>((m, s) => (s.lastSyncAt && (!m || s.lastSyncAt > m) ? s.lastSyncAt : m), null),
  };
}

