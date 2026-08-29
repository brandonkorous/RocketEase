/*
 * X (Twitter) adapter, API v2. OAuth 2.0 with PKCE is MANDATORY on X, so
 * `authorizationUrl` requires a code challenge and `exchangeCode` requires the
 * matching verifier. Refresh tokens are SINGLE USE: every refresh returns a new
 * access + refresh pair and the old refresh token dies immediately, so the
 * caller must persist the returned credential even if the following call fails.
 *
 * Publishing lives in publish.ts (media in media.ts), the inbox in inbox.ts and
 * insights in insights.ts. Real-time delivery (Account Activity API) is a
 * separately gated product, so ingestion is polling-only.
 */
import type { AuthorizeParams, ChannelDescriptor, ChannelKind, Credential, HealthReport, ProviderAdapter, ProviderConfig, PublishRequest, ValidationIssue } from "../types";
import { applyDisclosure } from "../disclosure";
import { ProviderError } from "../types";
import { form, httpJson } from "../http";
import { probe } from "../health";
import { validateAgainstCapabilities } from "../validate";
import { basicAuth, capsFor, mapXError, OAUTH_AUTH, OAUTH_REVOKE, OAUTH_TOKEN, SCOPES, TEXT_MAX, x, type XError } from "./client";
import { findPublication, publicationStatus, publish } from "./publish";
import { fetchInbox, findReply, reply } from "./inbox";
import { fetchInsights } from "./insights";

const DEFAULT_SCOPES = [...SCOPES.base, ...SCOPES.media];
/** DM access is optional: requested only when the caller asks for it. */
export const DM_SCOPES = [...SCOPES.dmRead, ...SCOPES.dmWrite];

type TokenRes = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; token_type?: string } & XError;
type Me = { id?: string; name?: string; username?: string; profile_image_url?: string };

const expiry = (s: number | undefined, fallback?: string) => (s ? new Date(Date.now() + s * 1000).toISOString() : fallback);

async function tokenCall(cfg: ProviderConfig, body: Record<string, string>): Promise<TokenRes> {
  const res = await httpJson<TokenRes>(OAUTH_TOKEN, {
    method: "POST",
    headers: { Authorization: basicAuth(cfg.clientId, cfg.clientSecret), "Content-Type": "application/x-www-form-urlencoded" },
    body: form(body),
  });
  if (res.status >= 400 || !res.body.access_token) throw mapXError(res.status === 200 ? 401 : res.status, res.body, { headers: res.headers });
  return res.body;
}

const me = async (token: string): Promise<Me> => (await x<{ data?: Me }>("/users/me?user.fields=name,username,profile_image_url", token)).body.data ?? {};

/** Post rules the generic capability validator has no field for. */
function xIssues(channel: ChannelDescriptor, req: Omit<PublishRequest, "idempotencyKey">): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const thread = ((req.settings ?? {}) as { thread?: string[] }).thread ?? [];
  const over = thread.find((t) => t.length > TEXT_MAX);
  if (over) issues.push({ severity: "error", code: "thread_part_too_long", message: `Every post in a thread must be ${TEXT_MAX} characters or fewer.`, field: "text" });
  const videos = req.media.filter((m) => m.mimeType.startsWith("video/"));
  const images = req.media.filter((m) => m.mimeType.startsWith("image/"));
  if (videos.length && images.length) issues.push({ severity: "error", code: "mixed_media", message: "An X post carries either one video or up to four images, not both.", field: "media" });
  if (videos.length > 1) issues.push({ severity: "error", code: "too_many_videos", message: "An X post carries at most one video.", field: "media" });
  if (req.media.length && !channel.capabilities.formats.includes("image"))
    issues.push({ severity: "error", code: "media_scope_missing", message: "Attaching media needs the media.write permission; reconnect the account to grant it.", field: "media" });
  return issues;
}

export function createXProvider(cfg: ProviderConfig): ProviderAdapter {
  const provider: ProviderAdapter = {
    key: "x",
    displayName: "X",
    networks: ["x"],
    accessSummary: ["See your X profile and posts", "Publish posts and threads as your account", "Read mentions and replies, and reply to them", "Read performance metrics for your own posts"],
    defaultScopes: DEFAULT_SCOPES,

    /** X requires PKCE; the caller owns the verifier and passes its challenge here. */
    authorizationUrl({ state, redirectUri, scopes: extra, codeChallenge, codeChallengeMethod }: AuthorizeParams) {
      if (!codeChallenge) throw new ProviderError("X requires PKCE: pass codeChallenge to authorizationUrl and the matching codeVerifier to exchangeCode.", { category: "validation", providerCode: "pkce_required" });
      const u = new URL(OAUTH_AUTH);
      u.searchParams.set("response_type", "code");
      u.searchParams.set("client_id", cfg.clientId);
      u.searchParams.set("redirect_uri", redirectUri);
      u.searchParams.set("state", state);
      u.searchParams.set("scope", [...new Set([...DEFAULT_SCOPES, ...(extra ?? [])])].join(" "));
      u.searchParams.set("code_challenge", codeChallenge);
      u.searchParams.set("code_challenge_method", codeChallengeMethod ?? "S256");
      return u.toString();
    },

    async exchangeCode(code, redirectUri, codeVerifier): Promise<Credential> {
      if (!codeVerifier) throw new ProviderError("X requires the PKCE code verifier to exchange an authorization code.", { category: "validation", providerCode: "pkce_required" });
      const t = await tokenCall(cfg, { grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: codeVerifier, client_id: cfg.clientId });
      const cred: Credential = { accessToken: t.access_token!, refreshToken: t.refresh_token, expiresAt: expiry(t.expires_in), scopes: (t.scope ?? "").split(" ").filter(Boolean), providerUserId: "unknown" };
      const u = await me(cred.accessToken).catch(() => ({}) as Me);
      return { ...cred, providerUserId: u.id ?? "unknown", providerUserName: u.username ? `@${u.username}` : u.name };
    },

    /**
     * Single-use refresh tokens: the returned pair MUST be persisted. If the
     * response carries no new refresh token the old one is already spent, so we
     * do not keep it — the connection needs a reconnect instead.
     */
    async refresh(cred) {
      if (!cred.refreshToken) throw new ProviderError("X access expired; reconnect required.", { category: "permission", providerCode: "no_refresh_token" });
      const t = await tokenCall(cfg, { grant_type: "refresh_token", refresh_token: cred.refreshToken, client_id: cfg.clientId });
      if (!t.refresh_token) throw new ProviderError("X did not return a new refresh token; reconnect required.", { category: "permission", providerCode: "refresh_token_not_rotated" });
      return { ...cred, accessToken: t.access_token!, refreshToken: t.refresh_token, expiresAt: expiry(t.expires_in, cred.expiresAt), scopes: t.scope ? t.scope.split(" ").filter(Boolean) : cred.scopes };
    },

    async revoke(cred) {
      await httpJson(OAUTH_REVOKE, {
        method: "POST",
        headers: { Authorization: basicAuth(cfg.clientId, cfg.clientSecret), "Content-Type": "application/x-www-form-urlencoded" },
        body: form({ token: cred.accessToken, token_type_hint: "access_token", client_id: cfg.clientId }),
      }).catch(() => undefined);
    },

    /** One X login manages exactly one account. */
    async listChannels(cred) {
      const u = await me(cred.accessToken);
      if (!u.id) return [];
      return [{ remoteId: u.id, kind: "x_account", network: "x", name: u.name ?? u.username ?? "X", handle: u.username ? `@${u.username}` : undefined, avatarUrl: u.profile_image_url, capabilities: capsFor(cred) }];
    },

    async describeChannel(cred, remoteId, kind: ChannelKind) {
      const c = (await provider.listChannels(cred)).find((ch) => ch.remoteId === remoteId && ch.kind === kind);
      if (!c) throw new ProviderError("This X account is no longer available to your login.", { category: "deleted" });
      return c;
    },

    healthCheck(cred): Promise<HealthReport> {
      return probe(SCOPES.base, cred.scopes, () => me(cred.accessToken));
    },

    validate(channel, req): ValidationIssue[] {
      return [...validateAgainstCapabilities(channel.capabilities, req), ...xIssues(channel, req)];
    },

    async publish(cred, channel, req: PublishRequest) {
      const errors = provider.validate(channel, req).filter((i) => i.severity === "error");
      if (errors.length) throw new ProviderError(errors[0].message, { category: "validation", providerCode: errors[0].code });
      const { request, emitted: disclosure } = applyDisclosure(channel, req);
      return { ...(await publish(cred, channel, request)), disclosure };
    },
    findPublication: (cred, channel, key) => findPublication(cred, channel, key),
    publicationStatus: (cred, channel, remoteId) => publicationStatus(cred, channel, remoteId),

    fetchInbox: (cred, channel, opts) => fetchInbox(cred, channel, opts),
    reply: (cred, channel, req) => reply(cred, channel, req),
    findReply: (cred, channel, lookup) => findReply(cred, channel, lookup),
    fetchInsights: (cred, channel, req) => fetchInsights(cred, channel, req),
    // Account Activity API (webhooks) is separately gated: polling only.
  };
  return provider;
}
