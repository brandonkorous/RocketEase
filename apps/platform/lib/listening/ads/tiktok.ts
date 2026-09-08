/*
 * TikTok Commercial Content Library: POST /v2/research/adlib/ad/query/ with a
 * client access token that carries research.adlib.basic — a scope TikTok
 * grants only after approving an application. Reference (2026-09-06):
 * filters search_term (≤ 50 chars), search_type, country_code_list,
 * ad_published_date_range (within a year); fields ad.id, first/last_shown_date,
 * status, videos, image_urls, reach, advertiser.business_name, paid_by; 10 a
 * request with a search_id for the next page; EU countries only.
 * TIKTOK_COMMERCIAL_CONTENT=1 says the application was approved; until then the
 * screen shows the reason and nothing is called.
 */
import { httpJson, categoryFromStatus, ProviderError } from "@rocketease/providers";
import type { AdItem, AdPage, AdSearch } from "../types";

export const TIKTOK_TOKEN = "https://open.tiktokapis.com/v2/oauth/token/";
export const TIKTOK_ADLIB = "https://open.tiktokapis.com/v2/research/adlib/ad/query/";
const FIELDS = "ad.id,ad.first_shown_date,ad.last_shown_date,ad.status,ad.videos,ad.image_urls,ad.reach,advertiser.business_name,advertiser.paid_for_by";

export const tiktokAdsConfigured = () => process.env.TIKTOK_COMMERCIAL_CONTENT === "1" && Boolean(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET);

type TokenRes = { access_token?: string; error?: string; error_description?: string };
type Ad = { ad?: { id?: string | number; first_shown_date?: string; last_shown_date?: string; status?: string; videos?: { url?: string }[]; image_urls?: string[]; reach?: { unique_users_seen?: string } }; advertiser?: { business_name?: string; paid_for_by?: string } };
type Res = { data?: { ads?: Ad[]; search_id?: string; has_more?: boolean }; error?: { code?: string; message?: string } };

export function tiktokAdToItem(a: Ad): AdItem | null {
  const id = a.ad?.id;
  if (id === undefined || id === null) return null;
  const reach = a.ad?.reach?.unique_users_seen;
  return {
    source: "tiktok", id: String(id), advertiser: a.advertiser?.business_name ?? "Unknown advertiser", text: a.advertiser?.paid_for_by ? `Paid for by ${a.advertiser.paid_for_by}` : null, title: null,
    snapshotUrl: a.ad?.videos?.[0]?.url ?? a.ad?.image_urls?.[0] ?? null, firstShown: a.ad?.first_shown_date ?? null, lastShown: a.ad?.last_shown_date ?? null, platforms: ["TikTok"],
    reach: null, reachLabel: reach ? `${reach} unique users (TikTok's bracket)` : null,
  };
}

async function clientToken(): Promise<string> {
  const body = new URLSearchParams({ client_key: process.env.TIKTOK_CLIENT_KEY ?? "", client_secret: process.env.TIKTOK_CLIENT_SECRET ?? "", grant_type: "client_credentials" }).toString();
  const res = await httpJson<TokenRes>(TIKTOK_TOKEN, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, timeoutMs: 20_000 });
  if (res.status >= 400 || !res.body?.access_token) throw new ProviderError(res.body?.error_description ?? res.body?.error ?? `TikTok token answered ${res.status}`, { category: "permission" });
  return res.body.access_token;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

export async function searchTikTokAds(input: AdSearch): Promise<AdPage> {
  if (!tiktokAdsConfigured()) throw new ProviderError("TikTok's Commercial Content API needs TikTok's approval of RocketEase's application; not enabled here.", { category: "permission" });
  const token = await clientToken();
  const now = new Date();
  const body = { filters: { search_term: input.term.slice(0, 50), search_type: "fuzzy_phrase", country_code_list: [input.country], ad_published_date_range: { min: ymd(new Date(now.getTime() - input.days * 86_400_000)), max: ymd(now) } }, max_count: 10, ...(input.cursor ? { search_id: input.cursor } : {}) };
  const res = await httpJson<Res>(`${TIKTOK_ADLIB}?fields=${encodeURIComponent(FIELDS)}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body), timeoutMs: 30_000 });
  if (res.status >= 400 || (res.body?.error?.code && res.body.error.code !== "ok")) throw new ProviderError(res.body?.error?.message ?? `TikTok answered ${res.status}`, { category: categoryFromStatus(res.status), providerCode: res.body?.error?.code });
  const d = res.body?.data;
  return { items: (d?.ads ?? []).map(tiktokAdToItem).filter((i): i is AdItem => Boolean(i)), cursor: d?.has_more ? d.search_id : undefined };
}
