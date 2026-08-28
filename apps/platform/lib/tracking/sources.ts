/*
 * Tracking source storage: sealed credentials, fact upserts, health.
 * Worker-safe (no server-only / next/headers) — the sync job imports this.
 */
import { and, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { channel } from "@/db/schema/connections";
import { campaign } from "@/db/schema/campaigns";
import { conversionEvent, conversionFact, trackingSource, type TrackingHealth, type TrackingKind, type TrackingSource } from "@/db/schema/tracking";
import { decryptJson, encryptJson } from "@/lib/crypto";
import { dimensionHash, networkForSource, type ConversionRow } from "./normalize";

export type TrackingCredential =
  | { kind: "ga4"; accessToken: string; refreshToken?: string; expiresAt?: string; scopes: string[] }
  | { kind: "shopify"; accessToken: string; scopes: string[] }
  | { kind: "webhook"; signingSecret: string };

/** Bound to the row id (AAD) so an envelope cannot be moved between sources. */
export const sealTrackingSecret = (sourceId: string, cred: TrackingCredential) => encryptJson(cred, `track:${sourceId}`);
export function openTrackingSecret(source: TrackingSource): TrackingCredential {
  if (!source.secret) throw new Error(`Tracking source ${source.id} has no credential`);
  return decryptJson<TrackingCredential>(source.secret, `track:${source.id}`);
}

/** App credentials for the OAuth-based sources; absent env = the source is not offered. */
export const ga4AppConfig = () => (process.env.GA4_CLIENT_ID ? { clientId: process.env.GA4_CLIENT_ID, clientSecret: process.env.GA4_CLIENT_SECRET ?? "" } : null);
export const shopifyAppConfig = () => (process.env.SHOPIFY_CLIENT_ID ? { clientId: process.env.SHOPIFY_CLIENT_ID, clientSecret: process.env.SHOPIFY_CLIENT_SECRET ?? "" } : null);
export const trackingKindEnabled = (kind: TrackingKind) => (kind === "ga4" ? !!ga4AppConfig() : kind === "shopify" ? !!shopifyAppConfig() : true);

export async function setSourceHealth(sourceId: string, patch: { status?: TrackingSource["status"]; health?: TrackingHealth; lastError?: string | null; lastSyncAt?: Date }) {
  await db.update(trackingSource).set({ ...patch, updatedAt: new Date() }).where(eq(trackingSource.id, sourceId));
}

/** utm_source → a channel in this workspace (via network), utm_campaign → a campaign (via its tracking.utmCampaign). */
export async function dimensionResolver(workspaceId: string) {
  const [channels, campaigns] = await Promise.all([
    db.select({ id: channel.id, network: channel.network }).from(channel).where(and(eq(channel.workspaceId, workspaceId), inArray(channel.status, ["healthy", "degraded"]))),
    db.select({ id: campaign.id, tracking: campaign.tracking, name: campaign.name }).from(campaign).where(and(eq(campaign.workspaceId, workspaceId), isNull(campaign.archivedAt))),
  ]);
  // Only an unambiguous single channel per network can own a row; two Instagram
  // channels sharing utm_source=instagram stay at workspace level.
  const byNetwork = new Map<string, string | null>();
  for (const c of channels) byNetwork.set(c.network, byNetwork.has(c.network) ? null : c.id);
  const byUtmCampaign = new Map<string, string>();
  for (const c of campaigns) {
    const key = (c.tracking.utmCampaign ?? c.name).trim().toLowerCase();
    if (key && !byUtmCampaign.has(key)) byUtmCampaign.set(key, c.id);
  }
  return (row: ConversionRow) => {
    const network = networkForSource(row.dimension.utm_source);
    const channelId = network ? (byNetwork.get(network) ?? undefined) : undefined;
    const campaignId = row.dimension.utm_campaign ? byUtmCampaign.get(row.dimension.utm_campaign) : undefined;
    return { ...row.dimension, channelId: channelId ?? undefined, campaignId };
  };
}

export type UpsertResult = { inserted: number; revised: number; hasRevenue: boolean };

/** Upsert daily facts; a changed value bumps revision so reports can flag the restatement. */
export async function upsertConversionFacts(source: Pick<TrackingSource, "id" | "organizationId" | "workspaceId">, rows: ConversionRow[]): Promise<UpsertResult> {
  const resolve = await dimensionResolver(source.workspaceId);
  let inserted = 0;
  let revised = 0;
  let hasRevenue = false;
  for (const r of rows) {
    if (r.metric === "revenue" && r.value > 0) hasRevenue = true;
    const dimension = resolve(r);
    const [out] = await db
      .insert(conversionFact)
      .values({
        organizationId: source.organizationId,
        workspaceId: source.workspaceId,
        sourceId: source.id,
        day: r.day,
        metric: r.metric,
        value: String(r.value),
        currency: r.currency ?? null,
        dimension,
        dimensionHash: dimensionHash(r.dimension),
        source: r.source,
      })
      .onConflictDoUpdate({
        target: [conversionFact.sourceId, conversionFact.day, conversionFact.metric, conversionFact.dimensionHash],
        set: {
          value: String(r.value),
          currency: r.currency ?? null,
          dimension,
          source: r.source,
          freshAt: new Date(),
          revision: sql`case when ${conversionFact.value} <> ${String(r.value)}::numeric then ${conversionFact.revision} + 1 else ${conversionFact.revision} end`,
        },
      })
      .returning({ revision: conversionFact.revision, created: sql<boolean>`(xmax = 0)` });
    if (out?.created) inserted++;
    else if (out && out.revision > 1) revised++;
  }
  return { inserted, revised, hasRevenue };
}

/** Webhook sources: facts are recomputed from the deduped event ledger for a day range. */
export async function ledgerRows(sourceId: string, since: string, until: string) {
  return db
    .select({ day: conversionEvent.day, count: conversionEvent.count, value: sql<number>`${conversionEvent.value}::float`, currency: conversionEvent.currency, dimension: conversionEvent.dimension, dimensionHash: conversionEvent.dimensionHash })
    .from(conversionEvent)
    .where(and(eq(conversionEvent.sourceId, sourceId), gte(conversionEvent.day, since), lte(conversionEvent.day, until)));
}
