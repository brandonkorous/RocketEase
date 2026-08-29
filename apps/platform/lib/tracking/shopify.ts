/*
 * Shopify conversion source — Admin GraphQL API.
 *
 * OAuth grants an OFFLINE access token (no `grant_options[]=per-user`), which
 * does not expire, so there is no refresh path. Orders are read with
 * read_orders; the landing-site UTM values come from
 * `customerJourneySummary.lastVisit.utmParameters`, which Shopify classifies as
 * protected customer data — a real app needs that approval before the field
 * resolves. read_marketing_events is requested so marketing attribution stays
 * available to the same grant.
 *
 * UNTESTED AGAINST A LIVE SHOP: no Shopify app credentials exist yet.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { categoryFromStatus, httpJson, ProviderError } from "@rocketease/providers";
import { cleanDimension, dimensionHash, isDay, type ConversionRow } from "./normalize";
import type { ConversionDimension } from "@/db/schema/tracking";

export const SHOPIFY_API_VERSION = "2025-01";
export const SHOPIFY_SCOPES = ["read_orders", "read_marketing_events"];

const SHOP_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;
export const isShopDomain = (s: string) => SHOP_RE.test(s);

/** Accepts "acme", "acme.myshopify.com", or a pasted admin URL; returns the canonical domain. */
export function normalizeShopDomain(input: string): string | null {
  const raw = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const domain = raw.includes(".") ? raw : `${raw}.myshopify.com`;
  return isShopDomain(domain) ? domain : null;
}

export const shopifyAuthorizeUrl = (shop: string, clientId: string, redirectUri: string, state: string) =>
  `https://${shop}/admin/oauth/authorize?${new URLSearchParams({ client_id: clientId, scope: SHOPIFY_SCOPES.join(","), redirect_uri: redirectUri, state }).toString()}`;

/** Shopify signs the OAuth callback query: HMAC-SHA256 over the sorted params minus `hmac`. */
export function verifyShopifyCallback(query: Record<string, string>, clientSecret: string): boolean {
  const { hmac, ...rest } = query;
  if (!hmac) return false;
  const message = Object.keys(rest).sort().map((k) => `${k}=${rest[k]}`).join("&");
  const expected = createHmac("sha256", clientSecret).update(message).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(hmac, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

type TokenRes = { access_token?: string; scope?: string; errors?: unknown };

export async function exchangeShopifyCode(shop: string, cfg: { clientId: string; clientSecret: string }, code: string): Promise<{ accessToken: string; scopes: string[] }> {
  const res = await httpJson<TokenRes>(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: cfg.clientId, client_secret: cfg.clientSecret, code }),
  });
  if (res.status >= 400 || !res.body.access_token) throw new ProviderError(`Shopify rejected the authorization code (${res.status}).`, { category: categoryFromStatus(res.status === 200 ? 401 : res.status) });
  return { accessToken: res.body.access_token, scopes: (res.body.scope ?? "").split(",").filter(Boolean) };
}

type GraphQlRes<T> = { data?: T; errors?: { message?: string; extensions?: { code?: string } }[] };

/** One Admin GraphQL call. Throttled responses come back as an errors[] with code THROTTLED, not a 429. */
export async function shopifyGraphql<T>(shop: string, token: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await httpJson<GraphQlRes<T>>(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    timeoutMs: 30_000,
  });
  if (res.status >= 400) throw new ProviderError(`Shopify Admin API error (${res.status}).`, { category: categoryFromStatus(res.status) });
  const err = res.body.errors?.[0];
  if (err) {
    const code = err.extensions?.code;
    const category = code === "THROTTLED" ? "rate_limit" : code === "ACCESS_DENIED" ? "permission" : "unknown";
    throw new ProviderError(err.message ?? "Shopify Admin API rejected the query.", { category, providerCode: code });
  }
  if (!res.body.data) throw new ProviderError("Shopify returned no data.", { category: "temporary" });
  return res.body.data;
}

export const ORDERS_QUERY = `query RkeOrders($cursor: String, $q: String!) {
  orders(first: 100, after: $cursor, query: $q, sortKey: CREATED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      createdAt
      currentTotalPriceSet { shopMoney { amount currencyCode } }
      customerJourneySummary { lastVisit { utmParameters { source medium campaign } } }
    }
  }
}`;

export type ShopifyOrder = {
  id?: string;
  createdAt?: string;
  currentTotalPriceSet?: { shopMoney?: { amount?: string; currencyCode?: string } };
  customerJourneySummary?: { lastVisit?: { utmParameters?: { source?: string; medium?: string; campaign?: string } | null } | null } | null;
};
type OrdersData = { orders?: { pageInfo?: { hasNextPage?: boolean; endCursor?: string }; nodes?: ShopifyOrder[] } };

/** Orders → one conversion + one revenue row per day × UTM combination. Orders with no UTM are skipped. */
export function ordersToRows(orders: ShopifyOrder[]): ConversionRow[] {
  const acc = new Map<string, { day: string; dimension: ConversionDimension; currency?: string; orders: number; revenue: number }>();
  for (const o of orders) {
    const utm = o.customerJourneySummary?.lastVisit?.utmParameters;
    if (!utm) continue;
    const dimension = cleanDimension({ utm_source: utm.source, utm_medium: utm.medium, utm_campaign: utm.campaign });
    if (!dimension.utm_source && !dimension.utm_campaign) continue;
    const day = (o.createdAt ?? "").slice(0, 10);
    if (!isDay(day)) continue;
    const key = `${day}|${dimensionHash(dimension)}`;
    const money = o.currentTotalPriceSet?.shopMoney;
    const entry = acc.get(key) ?? { day, dimension, currency: money?.currencyCode, orders: 0, revenue: 0 };
    entry.orders += 1;
    entry.revenue += Number(money?.amount ?? 0) || 0;
    acc.set(key, entry);
  }
  const rows: ConversionRow[] = [];
  for (const e of acc.values()) {
    rows.push({ day: e.day, metric: "conversions", value: e.orders, dimension: e.dimension, source: "shopify.orders" });
    if (e.revenue) rows.push({ day: e.day, metric: "revenue", value: Math.round(e.revenue * 100) / 100, currency: e.currency, dimension: e.dimension, source: "shopify.orders.total" });
  }
  return rows;
}

const MAX_PAGES = 50; // 5,000 orders per sync window; a busier shop needs a narrower tail.

/** Every order created in the window, paged. Shopify's `query` filter uses shop-local dates. */
export async function fetchShopifyConversions(shop: string, token: string, range: { since: string; until: string }): Promise<ConversionRow[]> {
  const q = `created_at:>=${range.since} created_at:<=${range.until}`;
  const all: ShopifyOrder[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await shopifyGraphql<OrdersData>(shop, token, ORDERS_QUERY, { cursor: cursor ?? null, q });
    all.push(...(data.orders?.nodes ?? []));
    if (!data.orders?.pageInfo?.hasNextPage) break;
    cursor = data.orders.pageInfo.endCursor;
    if (!cursor) break;
  }
  return ordersToRows(all);
}
