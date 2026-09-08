/*
 * Meta Ad Library: GET /ads_archive with a connected person's user token.
 * Reference (2026-09-06): ad_reached_countries (required, ISO codes or ALL),
 * search_terms (≤ 100 chars) or search_page_ids, ad_type ALL; ads that did not
 * reach the EU come back only when political or issue ads; error 613 is the
 * rate limit. Meta issues Ad Library tokens only to people who confirmed
 * their identity with Meta — its refusal is shown in its own words.
 */
import { createHmac } from "node:crypto";
import { httpJson, categoryFromStatus, ProviderError } from "@rocketease/providers";
import type { AdItem, AdPage, AdSearch } from "../types";

export const ADS_ARCHIVE = "https://graph.facebook.com/v21.0/ads_archive";
const FIELDS = "id,page_name,ad_creative_bodies,ad_creative_link_titles,ad_snapshot_url,ad_delivery_start_time,ad_delivery_stop_time,publisher_platforms,eu_total_reach";

export type ArchivedAd = { id?: string; page_name?: string; ad_creative_bodies?: string[]; ad_creative_link_titles?: string[]; ad_snapshot_url?: string; ad_delivery_start_time?: string; ad_delivery_stop_time?: string; publisher_platforms?: string[]; eu_total_reach?: number };
type Res = { data?: ArchivedAd[]; paging?: { cursors?: { after?: string }; next?: string }; error?: { message?: string; code?: number } };

export function archivedAdToItem(a: ArchivedAd): AdItem | null {
  if (!a.id) return null;
  return {
    source: "meta", id: a.id, advertiser: a.page_name ?? "Unknown page", text: a.ad_creative_bodies?.[0] ?? null, title: a.ad_creative_link_titles?.[0] ?? null, snapshotUrl: a.ad_snapshot_url ?? null,
    firstShown: a.ad_delivery_start_time ?? null, lastShown: a.ad_delivery_stop_time ?? null, platforms: a.publisher_platforms ?? [],
    reach: typeof a.eu_total_reach === "number" ? a.eu_total_reach : null, reachLabel: typeof a.eu_total_reach === "number" ? "EU reach (Meta's figure)" : null,
  };
}

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

export async function searchMetaAds(token: string, appSecret: string | undefined, input: AdSearch): Promise<AdPage> {
  const u = new URL(ADS_ARCHIVE);
  u.searchParams.set("search_terms", input.term.slice(0, 100));
  u.searchParams.set("ad_reached_countries", JSON.stringify([input.country]));
  u.searchParams.set("ad_type", "ALL");
  u.searchParams.set("ad_active_status", "ALL");
  u.searchParams.set("ad_delivery_date_min", daysAgo(input.days));
  u.searchParams.set("fields", FIELDS);
  u.searchParams.set("limit", "24");
  if (input.cursor) u.searchParams.set("after", input.cursor);
  u.searchParams.set("access_token", token);
  if (appSecret) u.searchParams.set("appsecret_proof", createHmac("sha256", appSecret).update(token).digest("hex"));
  const res = await httpJson<Res>(u.toString(), { timeoutMs: 30_000 });
  if (res.status >= 400 || res.body?.error) throw new ProviderError(res.body?.error?.message ?? `Meta Ad Library answered ${res.status}`, { category: res.body?.error?.code === 613 ? "rate_limit" : categoryFromStatus(res.status), providerCode: res.body?.error?.code ? String(res.body.error.code) : undefined });
  return { items: (res.body?.data ?? []).map(archivedAdToItem).filter((i): i is AdItem => Boolean(i)), cursor: res.body?.paging?.cursors?.after };
}
