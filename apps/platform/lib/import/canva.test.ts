import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { canvaAuthorizeUrl, createCanvaExport, exchangeCanvaCode, exportBody, getCanvaExport, listCanvaDesigns, pkcePair, refreshCanvaToken } from "./canva";

const cfg = { clientId: "cid", clientSecret: "sec" };

function stub(routes: Record<string, (init?: RequestInit, url?: string) => { status?: number; body?: unknown; headers?: Record<string, string> }>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const key = Object.keys(routes).find((k) => url.includes(k));
    const r = key ? routes[key](init, url) : { status: 404, body: { code: "not_found", message: "no route" } };
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200, headers: { "content-type": "application/json", ...(r.headers ?? {}) } });
  }));
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

describe("PKCE and the authorize url", () => {
  it("makes a 43-character verifier whose S256 challenge is what Canva requires", () => {
    const { verifier, challenge } = pkcePair();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
  });

  it("asks for exactly the read scopes, the code flow, and S256", () => {
    const u = new URL(canvaAuthorizeUrl("cid", "https://app.example/cb", "st", "ch"));
    expect(u.origin + u.pathname).toBe("https://www.canva.com/api/oauth/authorize");
    expect(Object.fromEntries(u.searchParams)).toEqual({ code_challenge: "ch", code_challenge_method: "S256", scope: "design:meta:read design:content:read profile:read", response_type: "code", client_id: "cid", redirect_uri: "https://app.example/cb", state: "st" });
  });
});

describe("tokens", () => {
  it("exchanges the code with basic auth and a form body, and reads the 4-hour expiry", async () => {
    const calls = stub({ "/rest/v1/oauth/token": () => ({ body: { access_token: "at", refresh_token: "rt", expires_in: 14400, token_type: "Bearer", scope: "design:meta:read design:content:read profile:read" } }) });
    const before = Date.now();
    const cred = await exchangeCanvaCode(cfg, "code1", "verifier1", "https://app.example/cb");
    expect(cred).toMatchObject({ accessToken: "at", refreshToken: "rt", scopes: ["design:meta:read", "design:content:read", "profile:read"] });
    expect(Date.parse(cred.expiresAt) - before).toBeGreaterThanOrEqual(14400 * 1000 - 1000);
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from("cid:sec").toString("base64")}`);
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(String(calls[0].init?.body)).toBe("grant_type=authorization_code&code=code1&code_verifier=verifier1&redirect_uri=https%3A%2F%2Fapp.example%2Fcb");
  });

  it("refreshes with the single-use refresh token and maps a refusal to a permission error", async () => {
    stub({ "/rest/v1/oauth/token": (init) => (String(init?.body).includes("refresh_token=old") ? { body: { access_token: "at2", refresh_token: "rt2", expires_in: 14400 } } : { status: 401, body: { error: "invalid_grant", error_description: "Refresh token was already used." } }) });
    expect(await refreshCanvaToken(cfg, "old")).toMatchObject({ accessToken: "at2", refreshToken: "rt2" });
    await expect(refreshCanvaToken(cfg, "used")).rejects.toMatchObject({ category: "permission", message: "Refresh token was already used." });
  });
});

describe("designs and exports", () => {
  it("lists designs newest first, by relevance when searching, and pages with the continuation token", async () => {
    const calls = stub({ "/rest/v1/designs": () => ({ body: { items: [{ id: "d1", title: "Spring sale", page_count: 2 }, { title: "no id" }], continuation: "c2" } }) });
    const page = await listCanvaDesigns("tok", {});
    expect(page.items.map((d) => d.id)).toEqual(["d1"]);
    expect(page.continuation).toBe("c2");
    expect(new URL(calls[0].url).searchParams.get("sort_by")).toBe("modified_descending");
    await listCanvaDesigns("tok", { query: "sale", continuation: "c2" });
    const q = new URL(calls[1].url).searchParams;
    expect(q.get("sort_by")).toBe("relevance");
    expect(q.get("continuation")).toBe("c2");
    expect(q.get("ownership")).toBe("any");
  });

  it("creates a PNG export (lossless) or a JPG export (quality 90), then polls the job", async () => {
    expect(exportBody("d1", "png")).toEqual({ design_id: "d1", format: { type: "png", lossless: true } });
    expect(exportBody("d1", "jpg")).toEqual({ design_id: "d1", format: { type: "jpg", quality: 90 } });
    const calls = stub({ "/rest/v1/exports/j1": () => ({ body: { job: { id: "j1", status: "success", urls: ["https://cdn.example/p1.png", "https://cdn.example/p2.png"] } } }), "/rest/v1/exports": () => ({ body: { job: { id: "j1", status: "in_progress" } } }) });
    expect(await createCanvaExport("tok", "d1", "png")).toMatchObject({ id: "j1", status: "in_progress" });
    expect(JSON.parse(String(calls[0].init?.body))).toEqual(exportBody("d1", "png"));
    expect(await getCanvaExport("tok", "j1")).toMatchObject({ status: "success", urls: ["https://cdn.example/p1.png", "https://cdn.example/p2.png"] });
  });

  it("maps a rate limit with its retry-after, and a 5xx on a create as ambiguous", async () => {
    stub({ "/rest/v1/exports": (init) => (init?.method === "POST" ? { status: 503, body: { code: "internal", message: "try later" } } : { status: 429, body: { code: "too_many_requests", message: "slow down" }, headers: { "retry-after": "30" } }) });
    await expect(createCanvaExport("tok", "d1", "png")).rejects.toMatchObject({ category: "temporary", ambiguous: true });
    await expect(getCanvaExport("tok", "j9")).rejects.toMatchObject({ category: "rate_limit", retryAfterSeconds: 30 });
  });
});
