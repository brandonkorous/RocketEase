import { afterEach, describe, expect, it, vi } from "vitest";
import { createXProvider } from "./index";

const cfg = { clientId: "id", clientSecret: "secret" };
const x = createXProvider(cfg);
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

function stub(routes: Record<string, () => { status?: number; body?: unknown }>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      const key = Object.keys(routes).find((k) => url.includes(k));
      const r = key ? routes[key]() : { status: 404, body: { title: "Not Found Error" } };
      return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("X OAuth 2.0 with PKCE", () => {
  it("puts the challenge on the consent URL and defaults the method to S256", () => {
    const url = new URL(x.authorizationUrl({ state: "st", redirectUri: "https://app.test/cb", codeChallenge: CHALLENGE }));
    expect(url.origin + url.pathname).toBe("https://x.com/i/oauth2/authorize");
    expect(url.searchParams.get("code_challenge")).toBe(CHALLENGE);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")?.split(" ")).toContain("offline.access");
    expect(url.searchParams.get("state")).toBe("st");
  });

  it("refuses to build a consent URL or exchange a code without PKCE", async () => {
    expect(() => x.authorizationUrl({ state: "st", redirectUri: "https://app.test/cb" })).toThrow(/PKCE/);
    await expect(x.exchangeCode("code", "https://app.test/cb")).rejects.toMatchObject({ category: "validation", providerCode: "pkce_required" });
  });

  it("sends the verifier and Basic client auth on the token call", async () => {
    const calls = stub({
      "/2/oauth2/token": () => ({ body: { access_token: "at", refresh_token: "rt", expires_in: 7200, scope: "tweet.read tweet.write users.read offline.access" } }),
      "/users/me": () => ({ body: { data: { id: "u1", name: "Acme", username: "acme" } } }),
    });
    const cred = await x.exchangeCode("code", "https://app.test/cb", "verifier-123");
    expect(cred).toMatchObject({ accessToken: "at", refreshToken: "rt", providerUserId: "u1", providerUserName: "@acme" });
    expect(cred.scopes).toContain("offline.access");
    const body = String(calls[0].init?.body);
    expect(body).toContain("code_verifier=verifier-123");
    expect(body).toContain("grant_type=authorization_code");
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("id:secret").toString("base64")}`);
  });

  it("rotates the single-use refresh token and demands a reconnect when X returns none", async () => {
    stub({ "/2/oauth2/token": () => ({ body: { access_token: "at2", refresh_token: "rt2", expires_in: 7200 } }) });
    const rotated = await x.refresh({ accessToken: "at", refreshToken: "rt", scopes: ["tweet.read"], providerUserId: "u1" });
    expect(rotated).toMatchObject({ accessToken: "at2", refreshToken: "rt2" });

    stub({ "/2/oauth2/token": () => ({ body: { access_token: "at3" } }) });
    await expect(x.refresh({ accessToken: "at", refreshToken: "rt", scopes: [], providerUserId: "u1" })).rejects.toMatchObject({ category: "permission", providerCode: "refresh_token_not_rotated" });
    await expect(x.refresh({ accessToken: "at", scopes: [], providerUserId: "u1" })).rejects.toMatchObject({ providerCode: "no_refresh_token" });
  });

  it("revokes with the client's Basic credentials and never throws", async () => {
    const calls = stub({ "/2/oauth2/revoke": () => ({ body: {} }) });
    await x.revoke({ accessToken: "at", scopes: [], providerUserId: "u1" });
    expect(String(calls[0].init?.body)).toContain("token_type_hint=access_token");
  });

  it("declares polling because the Account Activity API is separately gated", () => {
    expect(x.verifyWebhook).toBeUndefined();
    expect(x.parseWebhook).toBeUndefined();
  });
});
