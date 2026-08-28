import { afterEach, describe, expect, it, vi } from "vitest";
import { exchangeGa4Code, fetchGa4Conversions, fetchGa4Property, ga4AuthorizeUrl, reportToRows } from "./ga4";

/* GA4's runReport grid: headers name the columns, rows carry values in the same order. */
const report = (rows: (string | number)[][], metrics = ["sessions", "keyEvents", "totalRevenue"]) => ({
  dimensionHeaders: [{ name: "date" }, { name: "sessionSource" }, { name: "sessionMedium" }, { name: "sessionCampaignName" }],
  metricHeaders: metrics.map((name) => ({ name })),
  rows: rows.map((r) => ({ dimensionValues: r.slice(0, 4).map((value) => ({ value: String(value) })), metricValues: r.slice(4).map((value) => ({ value: String(value) })) })),
});

/** Token calls are form-encoded, report calls are JSON; keep both readable in assertions. */
const parseBody = (body: BodyInit | null | undefined) => {
  if (typeof body !== "string") return undefined;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return Object.fromEntries(new URLSearchParams(body).entries());
  }
};

function stub(routes: Record<string, () => { status?: number; body?: unknown }>) {
  const calls: { url: string; body?: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, body: parseBody(init?.body) });
      const key = Object.keys(routes).find((k) => url.includes(k));
      const r = key ? routes[key]() : { status: 404, body: { error: { code: 404, message: "not found", errors: [{ reason: "notFound" }] } } };
      return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("reportToRows", () => {
  it("keeps social rows, maps metric names, and normalizes UTM casing", () => {
    const rows = reportToRows(report([["20260810", "Instagram", "Social", "Spring-Launch", 120, 4, "310.50"]]), "USD");
    expect(rows).toEqual([
      { day: "2026-08-10", metric: "sessions", value: 120, currency: undefined, dimension: { utm_source: "instagram", utm_medium: "social", utm_campaign: "spring-launch" }, source: "ga4.sessions" },
      { day: "2026-08-10", metric: "conversions", value: 4, currency: undefined, dimension: { utm_source: "instagram", utm_medium: "social", utm_campaign: "spring-launch" }, source: "ga4.keyEvents" },
      { day: "2026-08-10", metric: "revenue", value: 310.5, currency: "USD", dimension: { utm_source: "instagram", utm_medium: "social", utm_campaign: "spring-launch" }, source: "ga4.totalRevenue" },
    ]);
  });

  it("drops non-social acquisition rows and zero values", () => {
    const rows = reportToRows(report([
      ["20260810", "google", "organic", "(not set)", 900, 12, "1000"],
      ["20260810", "newsletter", "email", "aug", 40, 2, "80"],
      ["20260810", "linkedin", "social", "aug", 0, 0, "0"],
    ]), "USD");
    expect(rows).toEqual([]);
  });

  it("accepts a paid social medium even when the source token is unknown", () => {
    const rows = reportToRows(report([["20260811", "somenetwork", "paid_social", "aug", 10, 1, "0"]]), "EUR");
    expect(rows.map((r) => r.metric)).toEqual(["sessions", "conversions"]);
    expect(rows[0].dimension.utm_medium).toBe("paid_social");
  });
});

describe("fetchGa4Conversions", () => {
  it("posts runReport with the date range and the keyEvents metric", async () => {
    const calls = stub({ ":runReport": () => ({ body: report([["20260810", "tiktok", "social", "aug", 5, 1, "20"]]) }) });
    const rows = await fetchGa4Conversions("tok", "401234567", { since: "2026-08-01", until: "2026-08-11" }, "USD");
    expect(calls[0].url).toContain("/properties/401234567:runReport");
    const body = calls[0].body as { dateRanges: { startDate: string; endDate: string }[]; metrics: { name: string }[] };
    expect(body.dateRanges[0]).toEqual({ startDate: "2026-08-01", endDate: "2026-08-11" });
    expect(body.metrics.map((m) => m.name)).toEqual(["sessions", "keyEvents", "totalRevenue"]);
    expect(rows).toHaveLength(3);
  });

  it("retries with the pre-2024 `conversions` metric when keyEvents is rejected", async () => {
    let call = 0;
    const calls = stub({
      ":runReport": () => {
        call++;
        return call === 1
          ? { status: 400, body: { error: { code: 400, message: "invalid metric keyEvents", errors: [{ reason: "invalidParameter" }] } } }
          : { body: report([["20260810", "facebook", "social", "aug", 7, 2, "0"]], ["sessions", "conversions", "totalRevenue"]) };
      },
    });
    const rows = await fetchGa4Conversions("tok", "1", { since: "2026-08-01", until: "2026-08-11" });
    expect(calls).toHaveLength(2);
    expect((calls[1].body as { metrics: { name: string }[] }).metrics[1].name).toBe("conversions");
    expect(rows.find((r) => r.metric === "conversions")?.value).toBe(2);
  });

  it("surfaces a permission failure rather than retrying it as a schema problem", async () => {
    stub({ ":runReport": () => ({ status: 403, body: { error: { code: 403, message: "User does not have access", errors: [{ reason: "forbidden" }] } } }) });
    await expect(fetchGa4Conversions("tok", "1", { since: "2026-08-01", until: "2026-08-02" })).rejects.toMatchObject({ category: "permission" });
  });
});

describe("property and OAuth", () => {
  it("reads the display name and reporting currency from the Admin API", async () => {
    stub({ analyticsadmin: () => ({ body: { displayName: "Acme storefront", currencyCode: "GBP" } }) });
    await expect(fetchGa4Property("tok", "401234567")).resolves.toEqual({ displayName: "Acme storefront", currency: "GBP" });
  });

  it("asks Google for offline access so a refresh token comes back", () => {
    const url = new URL(ga4AuthorizeUrl("client-id", "https://app.test/api/tracking/ga4/callback", "state.nonce"));
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/analytics.readonly");
    expect(url.searchParams.get("state")).toBe("state.nonce");
  });

  it("exchanges the code and keeps the granted scopes", async () => {
    stub({ "oauth2.googleapis.com/token": () => ({ body: { access_token: "at", refresh_token: "rt", expires_in: 3600, scope: "https://www.googleapis.com/auth/analytics.readonly" } }) });
    const cred = await exchangeGa4Code({ clientId: "id", clientSecret: "s" }, "code", "https://app.test/cb");
    expect(cred).toMatchObject({ accessToken: "at", refreshToken: "rt", scopes: ["https://www.googleapis.com/auth/analytics.readonly"] });
    expect(Date.parse(cred.expiresAt!)).toBeGreaterThan(Date.now());
  });
});
