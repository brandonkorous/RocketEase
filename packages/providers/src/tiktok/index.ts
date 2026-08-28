/*
 * TikTok adapter. Login Kit OAuth + Display API for identity, Content Posting
 * API for publishing (publish.ts), Business Account API for comments and daily
 * insights (inbox.ts / insights.ts — gated by granted scopes). Unaudited apps
 * can only post to private accounts until TikTok approves video.publish.
 */
import type { AuthorizeParams, ChannelKind, Credential, HealthReport, ProviderAdapter, ProviderConfig, PublishRequest, ValidationIssue } from "../types";
import { ProviderError } from "../types";
import { form, httpJson } from "../http";
import { probe } from "../health";
import { validateAgainstCapabilities } from "../validate";
import { API, capsFor, mapTikTokError, SCOPES, tt, type TtError } from "./client";
import { findPublication, publicationStatus, publish } from "./publish";
import { fetchInbox, findReply, reply } from "./inbox";
import { fetchInsights } from "./insights";
import { parseTikTokWebhook, verifyTikTokWebhook } from "./webhooks";

type TokenRes = { access_token?: string; refresh_token?: string; expires_in?: number; open_id?: string; scope?: string } & TtError;
type User = { open_id: string; display_name?: string; username?: string; avatar_url?: string };

const expiry = (s: number | undefined, fallback?: string) => (s ? new Date(Date.now() + s * 1000).toISOString() : fallback);

async function tokenCall(body: Record<string, string>): Promise<TokenRes> {
  const res = await httpJson<TokenRes>(`${API}/oauth/token/`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form(body) });
  if (res.status >= 400 || !res.body.access_token) throw mapTikTokError(res.status === 200 ? 401 : res.status, res.body, { headers: res.headers });
  return res.body;
}

const userInfo = (token: string) => tt<{ data?: { user?: User } }>("/user/info/?fields=open_id,display_name,username,avatar_url", token);

export function createTikTokProvider(cfg: ProviderConfig): ProviderAdapter {
  const provider: ProviderAdapter = {
    key: "tiktok",
    displayName: "TikTok",
    networks: ["tiktok"],
    accessSummary: ["See your TikTok profile and stats", "Publish videos and photo posts to your account", "Read your videos and their performance", "Read and reply to comments (Business accounts)"],
    defaultScopes: SCOPES.base,

    authorizationUrl({ state, redirectUri, scopes: extra }: AuthorizeParams) {
      const u = new URL("https://www.tiktok.com/v2/auth/authorize/");
      u.searchParams.set("client_key", cfg.clientId);
      u.searchParams.set("response_type", "code");
      u.searchParams.set("scope", [...new Set([...SCOPES.base, ...(extra ?? [])])].join(","));
      u.searchParams.set("redirect_uri", redirectUri);
      u.searchParams.set("state", state);
      return u.toString();
    },

    async exchangeCode(code, redirectUri): Promise<Credential> {
      const t = await tokenCall({ client_key: cfg.clientId, client_secret: cfg.clientSecret, code, grant_type: "authorization_code", redirect_uri: redirectUri });
      return { accessToken: t.access_token!, refreshToken: t.refresh_token, expiresAt: expiry(t.expires_in), scopes: (t.scope ?? "").split(",").filter(Boolean), providerUserId: t.open_id ?? "unknown" };
    },

    /** Access tokens last 24h; refresh tokens last 365d and rotate on use. */
    async refresh(cred) {
      if (!cred.refreshToken) throw new ProviderError("TikTok access expired; reconnect required.", { category: "permission", providerCode: "no_refresh_token" });
      const t = await tokenCall({ client_key: cfg.clientId, client_secret: cfg.clientSecret, grant_type: "refresh_token", refresh_token: cred.refreshToken });
      return { ...cred, accessToken: t.access_token!, refreshToken: t.refresh_token ?? cred.refreshToken, expiresAt: expiry(t.expires_in, cred.expiresAt) };
    },

    async revoke(cred) {
      await httpJson(`${API}/oauth/revoke/`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form({ client_key: cfg.clientId, client_secret: cfg.clientSecret, token: cred.accessToken }) }).catch(() => undefined);
    },

    async listChannels(cred) {
      const u = (await userInfo(cred.accessToken)).data?.user;
      if (!u) return [];
      return [{ remoteId: u.open_id, kind: "tiktok_account", network: "tiktok", name: u.display_name ?? u.username ?? "TikTok", handle: u.username ? `@${u.username}` : undefined, avatarUrl: u.avatar_url, capabilities: capsFor(cred) }];
    },

    async describeChannel(cred, remoteId, kind: ChannelKind) {
      const c = (await provider.listChannels(cred)).find((x) => x.remoteId === remoteId && x.kind === kind);
      if (!c) throw new ProviderError("TikTok account unavailable", { category: "deleted" });
      return c;
    },

    healthCheck(cred): Promise<HealthReport> {
      return probe(["user.info.basic", "video.publish"], cred.scopes, () => userInfo(cred.accessToken));
    },

    validate(channel, req): ValidationIssue[] {
      return validateAgainstCapabilities(channel.capabilities, req);
    },

    async publish(cred, channel, req: PublishRequest) {
      const errors = provider.validate(channel, req).filter((i) => i.severity === "error");
      if (errors.length) throw new ProviderError(errors[0].message, { category: "validation", providerCode: errors[0].code });
      return publish(cred, channel, req);
    },
    findPublication: (cred, _channel, key) => findPublication(cred, key),
    publicationStatus: (cred, _channel, remoteId) => publicationStatus(cred, remoteId),

    fetchInbox: (cred, channel, opts) => fetchInbox(cred, channel, opts),
    reply: (cred, channel, req) => reply(cred, channel, req),
    findReply: (cred, channel, key) => findReply(cred, channel, key),
    fetchInsights: (cred, channel, req) => fetchInsights(cred, channel, req),
    inboxItemsFromWebhook: () => null,

    verifyWebhook: ({ headers, rawBody }) => verifyTikTokWebhook(cfg, headers, rawBody),
    parseWebhook: (rawBody) => parseTikTokWebhook(rawBody),
  };
  return provider;
}
