/*
 * Pinterest adapter (API v5). One authorization yields one account channel
 * (analytics + followers) and one channel per board (publishing + pin
 * analytics). Publishing lives in publish.ts, insights in insights.ts; there is
 * no inbox at all — see inbox.ts for exactly what v5 does not offer.
 */
import type { AuthorizeParams, ChannelDescriptor, ChannelKind, Credential, HealthReport, ProviderAdapter, ProviderConfig, PublishRequest, ValidationIssue } from "../types";
import { applyDisclosure } from "../disclosure";
import { ProviderError } from "../types";
import { form, httpJson } from "../http";
import { probe } from "../health";
import { validateAgainstCapabilities } from "../validate";
import { accountCaps, API, basicAuth, boardCaps, LIMITS, mapPinterestError, OAUTH_AUTH, pin, SCOPES, type PinError } from "./client";
import { findPublication, publicationStatus, publish, titleFor } from "./publish";
import { fetchInsights } from "./insights";

const DEFAULT_SCOPES = [...SCOPES.boards, ...SCOPES.pins, ...SCOPES.account];

type TokenRes = { access_token?: string; refresh_token?: string; expires_in?: number; refresh_token_expires_in?: number; scope?: string } & PinError;
type Account = { id?: string; username?: string; business_name?: string; profile_image?: string; account_type?: string; follower_count?: number };
type Board = { id?: string; name?: string; description?: string; privacy?: string; media?: { image_cover_url?: string } };

const expiry = (s: number | undefined, fallback?: string) => (s ? new Date(Date.now() + s * 1000).toISOString() : fallback);

async function tokenCall(cfg: ProviderConfig, body: Record<string, string>): Promise<TokenRes> {
  const res = await httpJson<TokenRes>(`${API}/oauth/token`, {
    method: "POST",
    headers: { Authorization: basicAuth(cfg.clientId, cfg.clientSecret), "Content-Type": "application/x-www-form-urlencoded" },
    body: form(body),
  });
  if (res.status >= 400 || !res.body.access_token) throw mapPinterestError(res.status === 200 ? 401 : res.status, res.body, { headers: res.headers });
  return res.body;
}

const account = async (token: string) => (await pin<Account>("/user_account", token)).body;

async function channelsFor(cred: Credential): Promise<ChannelDescriptor[]> {
  const me = await account(cred.accessToken);
  const name = me.business_name || me.username || "Pinterest account";
  const out: ChannelDescriptor[] = [
    { remoteId: me.id ?? me.username ?? cred.providerUserId, kind: "pinterest_account", network: "pinterest", name, handle: me.username ? `@${me.username}` : undefined, avatarUrl: me.profile_image, capabilities: accountCaps(cred) },
  ];
  const boards = await pin<{ items?: Board[] }>("/boards", cred.accessToken, { query: { page_size: "100" } }).catch((e) => {
    if (e instanceof ProviderError && e.category === "permission") return { body: { items: [] as Board[] } };
    throw e;
  });
  for (const b of boards.body.items ?? []) {
    if (!b.id) continue;
    out.push({ remoteId: b.id, kind: "pinterest_board", network: "pinterest", name: b.name ?? "Board", handle: me.username ? `@${me.username}` : undefined, avatarUrl: b.media?.image_cover_url, capabilities: boardCaps(cred) });
  }
  return out;
}

/** Pin rules the generic capability validator has no field for. */
function pinterestIssues(channel: ChannelDescriptor, req: Omit<PublishRequest, "idempotencyKey">): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (channel.kind !== "pinterest_board") issues.push({ severity: "error", code: "board_required", message: "Pick a Pinterest board to pin to.", field: "settings" });
  const title = titleFor(req);
  if (title && title.length >= LIMITS.title) issues.push({ severity: "warning", code: "title_truncated", message: `Pinterest titles are cut off after ${LIMITS.title} characters.`, field: "text" });
  const images = req.media.filter((m) => m.mimeType.startsWith("image/"));
  if (req.format === "carousel" && images.length < LIMITS.carouselMin) issues.push({ severity: "error", code: "carousel_too_small", message: `A Pinterest carousel needs at least ${LIMITS.carouselMin} images.`, field: "media" });
  if (req.media.some((m) => m.mimeType.startsWith("video/")) && !images.length)
    issues.push({ severity: "error", code: "cover_image_required", message: "A Pinterest video pin needs a cover image alongside the video.", field: "media" });
  const alt = req.media.find((m) => m.altText)?.altText;
  if (alt && alt.length > LIMITS.altText) issues.push({ severity: "warning", code: "alt_text_truncated", message: `Alt text is cut off after ${LIMITS.altText} characters.`, field: "media" });
  return issues;
}

export function createPinterestProvider(cfg: ProviderConfig): ProviderAdapter {
  const provider: ProviderAdapter = {
    key: "pinterest",
    displayName: "Pinterest",
    networks: ["pinterest"],
    accessSummary: ["See your Pinterest account and boards", "Create pins on the boards you choose", "Read your account and pin analytics"],
    defaultScopes: DEFAULT_SCOPES,

    authorizationUrl({ state, redirectUri, scopes: extra }: AuthorizeParams) {
      const u = new URL(OAUTH_AUTH);
      u.searchParams.set("client_id", cfg.clientId);
      u.searchParams.set("response_type", "code");
      u.searchParams.set("redirect_uri", redirectUri);
      u.searchParams.set("state", state);
      u.searchParams.set("scope", [...new Set([...DEFAULT_SCOPES, ...(extra ?? [])])].join(","));
      return u.toString();
    },

    async exchangeCode(code, redirectUri): Promise<Credential> {
      const t = await tokenCall(cfg, { grant_type: "authorization_code", code, redirect_uri: redirectUri });
      const cred: Credential = { accessToken: t.access_token!, refreshToken: t.refresh_token, expiresAt: expiry(t.expires_in), scopes: (t.scope ?? "").split(/[ ,]/).filter(Boolean), providerUserId: "unknown" };
      const me = await account(cred.accessToken).catch(() => ({}) as Account);
      return { ...cred, providerUserId: me.id ?? me.username ?? "unknown", providerUserName: me.business_name || me.username };
    },

    /** Access tokens last 30 days, refresh tokens a year; the refresh response may rotate both. */
    async refresh(cred) {
      if (!cred.refreshToken) throw new ProviderError("Pinterest access expired; reconnect required.", { category: "permission", providerCode: "no_refresh_token" });
      const t = await tokenCall(cfg, { grant_type: "refresh_token", refresh_token: cred.refreshToken });
      return { ...cred, accessToken: t.access_token!, refreshToken: t.refresh_token ?? cred.refreshToken, expiresAt: expiry(t.expires_in, cred.expiresAt) };
    },

    /**
     * Pinterest API v5 publishes no token revocation endpoint. Disconnecting
     * deletes our copy of the credential; the user removes the app under
     * Pinterest → Settings → Apps to end the grant on their side.
     */
    async revoke() {},

    listChannels: (cred) => channelsFor(cred),

    async describeChannel(cred, remoteId, kind: ChannelKind) {
      const c = (await channelsFor(cred)).find((x) => x.remoteId === remoteId && x.kind === kind);
      if (!c) throw new ProviderError("This Pinterest board is no longer available to your login.", { category: "deleted" });
      return c;
    },

    healthCheck(cred): Promise<HealthReport> {
      return probe([...SCOPES.account, ...SCOPES.pins], cred.scopes, () => account(cred.accessToken));
    },

    validate(channel, req): ValidationIssue[] {
      return [...validateAgainstCapabilities(channel.capabilities, req), ...pinterestIssues(channel, req)];
    },

    async publish(cred, channel, req: PublishRequest) {
      const errors = provider.validate(channel, req).filter((i) => i.severity === "error");
      if (errors.length) throw new ProviderError(errors[0].message, { category: "validation", providerCode: errors[0].code });
      const { request, emitted: disclosure } = applyDisclosure(channel, req);
      return { ...(await publish(cred, channel, request)), disclosure };
    },
    findPublication: (cred, channel, key) => findPublication(cred, channel, key),
    publicationStatus: (cred, _channel, remoteId) => publicationStatus(cred, remoteId),

    fetchInsights: (cred, channel, req) => fetchInsights(cred, channel, req),
    // No inbox and no webhooks on Pinterest API v5 — see inbox.ts.
  };
  return provider;
}
