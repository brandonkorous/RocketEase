/*
 * One entry point per source kind: hand back the daily rows for a window.
 * GA4 and Shopify are pulled from their APIs; a webhook source is recomputed
 * from its own deduped event ledger.
 */
import { eq } from "drizzle-orm";
import { ProviderError } from "@rocketease/providers";
import { db } from "@/db";
import { trackingSource, type TrackingSource } from "@/db/schema/tracking";
import { fetchGa4Conversions, refreshGa4Token, type Ga4Credential } from "./ga4";
import { fetchShopifyConversions } from "./shopify";
import { eventsToRows } from "./webhook";
import type { ConversionRow } from "./normalize";
import { ga4AppConfig, ledgerRows, openTrackingSecret, sealTrackingSecret, type TrackingCredential } from "./sources";

export type Range = { since: string; until: string };

/** Refresh a GA4 token within 24h of expiry and persist it. Permission failures surface as-is. */
async function usableGa4Token(source: TrackingSource, cred: Ga4Credential): Promise<string> {
  const cfg = ga4AppConfig();
  if (!cfg) throw new ProviderError("Google Analytics is not configured in this deployment.", { category: "permission" });
  const soon = Date.now() + 24 * 3_600_000;
  if (!cred.expiresAt || new Date(cred.expiresAt).getTime() >= soon) return cred.accessToken;
  const next = await refreshGa4Token(cfg, cred);
  const sealed: TrackingCredential = { kind: "ga4", ...next };
  await db.update(trackingSource).set({ secret: sealTrackingSecret(source.id, sealed), updatedAt: new Date() }).where(eq(trackingSource.id, source.id));
  return next.accessToken;
}

export async function fetchRowsForSource(source: TrackingSource, range: Range): Promise<ConversionRow[]> {
  if (source.kind === "webhook") return eventsToRows(await ledgerRows(source.id, range.since, range.until));
  const cred = openTrackingSecret(source);
  if (source.kind === "ga4") {
    if (cred.kind !== "ga4") throw new ProviderError("This source's credential does not match its kind.", { category: "permission" });
    const propertyId = source.config.propertyId;
    if (!propertyId) throw new ProviderError("This GA4 source has no property id.", { category: "validation" });
    return fetchGa4Conversions(await usableGa4Token(source, cred), propertyId, range, source.config.currency);
  }
  if (cred.kind !== "shopify") throw new ProviderError("This source's credential does not match its kind.", { category: "permission" });
  const shop = source.config.shopDomain;
  if (!shop) throw new ProviderError("This Shopify source has no shop domain.", { category: "validation" });
  return fetchShopifyConversions(shop, cred.accessToken, range);
}

