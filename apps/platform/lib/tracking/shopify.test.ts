import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { exchangeShopifyCode, fetchShopifyConversions, normalizeShopDomain, ordersToRows, shopifyAuthorizeUrl, verifyShopifyCallback, type ShopifyOrder } from "./shopify";

const order = (over: Partial<ShopifyOrder> & { source?: string; medium?: string; campaign?: string; amount?: string } = {}): ShopifyOrder => ({
  id: over.id ?? "gid://shopify/Order/1",
  createdAt: over.createdAt ?? "2026-08-10T14:03:00Z",
  currentTotalPriceSet: { shopMoney: { amount: over.amount ?? "42.50", currencyCode: "USD" } },
  customerJourneySummary: over.source === undefined && over.campaign === undefined ? null : { lastVisit: { utmParameters: { source: over.source, medium: over.medium, campaign: over.campaign } } },
});

function stub(routes: Record<string, () => { status?: number; body?: unknown }>) {
  const calls: { url: string; body?: unknown; headers?: HeadersInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined, headers: init?.headers });
      const key = Object.keys(routes).find((k) => url.includes(k));
      const r = key ? routes[key]() : { status: 404, body: {} };
      return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("normalizeShopDomain", () => {
  it("accepts a bare handle, a full domain, and a pasted admin URL", () => {
    expect(normalizeShopDomain("acme")).toBe("acme.myshopify.com");
    expect(normalizeShopDomain("Acme.myshopify.com")).toBe("acme.myshopify.com");
    expect(normalizeShopDomain("https://acme.myshopify.com/admin/orders")).toBe("acme.myshopify.com");
  });

  it("rejects anything that is not a myshopify domain", () => {
    expect(normalizeShopDomain("acme.com")).toBeNull();
    expect(normalizeShopDomain("evil.example/acme.myshopify.com")).toBeNull();
    expect(normalizeShopDomain("")).toBeNull();
  });
});

describe("verifyShopifyCallback", () => {
  const secret = "shpss_secret";
  const sign = (params: Record<string, string>) => createHmac("sha256", secret).update(Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&")).digest("hex");

  it("accepts a correctly signed callback regardless of param order", () => {
    const params = { code: "abc", shop: "acme.myshopify.com", state: "s.n", timestamp: "1" };
    expect(verifyShopifyCallback({ hmac: sign(params), state: "s.n", shop: "acme.myshopify.com", code: "abc", timestamp: "1" }, secret)).toBe(true);
  });

  it("rejects a tampered param, a missing hmac, and the wrong secret", () => {
    const params = { code: "abc", shop: "acme.myshopify.com", state: "s.n" };
    const hmac = sign(params);
    expect(verifyShopifyCallback({ ...params, hmac, shop: "evil.myshopify.com" }, secret)).toBe(false);
    expect(verifyShopifyCallback({ ...params }, secret)).toBe(false);
    expect(verifyShopifyCallback({ ...params, hmac }, "other")).toBe(false);
  });
});

describe("ordersToRows", () => {
  it("aggregates orders into one conversion and one revenue row per day and UTM", () => {
    const rows = ordersToRows([
      order({ source: "Instagram", medium: "social", campaign: "Spring", amount: "42.50" }),
      order({ id: "2", source: "instagram", medium: "social", campaign: "spring", amount: "7.50" }),
    ]);
    expect(rows).toEqual([
      { day: "2026-08-10", metric: "conversions", value: 2, dimension: { utm_source: "instagram", utm_medium: "social", utm_campaign: "spring" }, source: "shopify.orders" },
      { day: "2026-08-10", metric: "revenue", value: 50, currency: "USD", dimension: { utm_source: "instagram", utm_medium: "social", utm_campaign: "spring" }, source: "shopify.orders.total" },
    ]);
  });

  it("skips orders with no customer journey and separates days", () => {
    const rows = ordersToRows([
      order({ id: "1" }),
      order({ id: "2", createdAt: "2026-08-11T09:00:00Z", source: "tiktok", medium: "social", amount: "10.00" }),
    ]);
    expect(rows.filter((r) => r.metric === "conversions")).toEqual([{ day: "2026-08-11", metric: "conversions", value: 1, dimension: { utm_source: "tiktok", utm_medium: "social", utm_campaign: undefined }, source: "shopify.orders" }]);
  });

  it("emits no revenue row when the orders are all zero-value", () => {
    const rows = ordersToRows([order({ source: "linkedin", medium: "social", amount: "0.00" })]);
    expect(rows.map((r) => r.metric)).toEqual(["conversions"]);
  });
});

describe("fetchShopifyConversions", () => {
  it("sends the access token header and pages until hasNextPage is false", async () => {
    let page = 0;
    const calls = stub({
      "graphql.json": () => {
        page++;
        return page === 1
          ? { body: { data: { orders: { pageInfo: { hasNextPage: true, endCursor: "c1" }, nodes: [order({ source: "instagram", medium: "social", amount: "10.00" })] } } } }
          : { body: { data: { orders: { pageInfo: { hasNextPage: false }, nodes: [order({ id: "2", source: "instagram", medium: "social", amount: "5.00" })] } } } };
      },
    });
    const rows = await fetchShopifyConversions("acme.myshopify.com", "shpat_x", { since: "2026-08-01", until: "2026-08-11" });
    expect(calls).toHaveLength(2);
    expect((calls[0].headers as Record<string, string>)["X-Shopify-Access-Token"]).toBe("shpat_x");
    expect((calls[0].body as { variables: { q: string } }).variables.q).toBe("created_at:>=2026-08-01 created_at:<=2026-08-11");
    expect((calls[1].body as { variables: { cursor: string } }).variables.cursor).toBe("c1");
    expect(rows.find((r) => r.metric === "conversions")?.value).toBe(2);
  });

  it("maps a GraphQL ACCESS_DENIED error to a permission failure", async () => {
    stub({ "graphql.json": () => ({ body: { errors: [{ message: "Access denied for orders field", extensions: { code: "ACCESS_DENIED" } }] } }) });
    await expect(fetchShopifyConversions("acme.myshopify.com", "t", { since: "2026-08-01", until: "2026-08-02" })).rejects.toMatchObject({ category: "permission" });
  });

  it("maps THROTTLED to rate_limit rather than a hard failure", async () => {
    stub({ "graphql.json": () => ({ body: { errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }] } }) });
    await expect(fetchShopifyConversions("acme.myshopify.com", "t", { since: "2026-08-01", until: "2026-08-02" })).rejects.toMatchObject({ category: "rate_limit" });
  });
});

describe("OAuth", () => {
  it("requests read_orders and read_marketing_events on the shop's own domain", () => {
    const url = new URL(shopifyAuthorizeUrl("acme.myshopify.com", "cid", "https://app.test/cb", "s.n"));
    expect(url.host).toBe("acme.myshopify.com");
    expect(url.searchParams.get("scope")).toBe("read_orders,read_marketing_events");
    expect(url.searchParams.get("state")).toBe("s.n");
  });

  it("exchanges the code for an offline token", async () => {
    stub({ "/admin/oauth/access_token": () => ({ body: { access_token: "shpat_1", scope: "read_orders,read_marketing_events" } }) });
    await expect(exchangeShopifyCode("acme.myshopify.com", { clientId: "id", clientSecret: "s" }, "code")).resolves.toEqual({ accessToken: "shpat_1", scopes: ["read_orders", "read_marketing_events"] });
  });
});
