/*
 * Threads adapter (Threads API v1.0). Its own app id, its own consent host and
 * token exchange: a short-lived token (1 h) is swapped for a long-lived one
 * (60 days) at connect time and refreshed with th_refresh_token, which Threads
 * only allows once the token is 24 hours old. There is no token-revocation
 * endpoint and no permissions endpoint, so `revoke` is a documented no-op and
 * the recorded scopes are the ones we requested. Free, 250 posts per 24 h.
 */
import type { AuthorizeParams, ChannelDescriptor, ChannelKind, Credential, HealthReport, ProviderAdapter, ProviderConfig, PublishRequest, ValidationIssue } from "../types";
import { applyDisclosure } from "../disclosure";
import { ProviderError } from "../types";
import { probe } from "../health";
import { validateAgainstCapabilities } from "../validate";
import { parseMetaSignedRequest } from "../meta/signed-request";
import { capsFor, expiry, LIMITS, OAUTH_AUTH, SCOPES, threads, tokenCall } from "./client";
import { findPublication, publicationStatus, publish, type ThreadsSettings } from "./publish";
import { fetchInbox, findReply, reply } from "./inbox";
import { fetchInsights } from "./insights";

export const DEFAULT_SCOPES = [...SCOPES.base, ...SCOPES.publish, ...SCOPES.readReplies, ...SCOPES.manageReplies, ...SCOPES.insights];

type Me = { id?: string; username?: string; name?: string; threads_profile_picture_url?: string };
type ShortToken = { access_token?: string; user_id?: string | number };
type LongToken = { access_token?: string; expires_in?: number };

const me = (token: string) => threads<Me>("/me", token, { params: { fields: "id,username,name,threads_profile_picture_url" } });

/** Post rules the generic capability validator has no field for. */
export function threadsIssues(req: Omit<PublishRequest, "idempotencyKey">): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const s = (req.settings ?? {}) as ThreadsSettings;
  if (req.format === "carousel" && req.media.length < LIMITS.carouselMin)
    issues.push({ severity: "error", code: "carousel_too_small", message: `A Threads carousel needs at least ${LIMITS.carouselMin} items.`, field: "media" });
  if (req.format === "carousel" && req.media.length > LIMITS.carouselMax)
    issues.push({ severity: "error", code: "carousel_too_large", message: `A Threads carousel holds at most ${LIMITS.carouselMax} items.`, field: "media" });
  if ((req.format === "image" || req.format === "video") && req.media.length > 1)
    issues.push({ severity: "error", code: "carousel_required", message: "Several items publish as a carousel on Threads; pick the carousel format.", field: "media" });
  if (s.topicTag && (s.topicTag.length > LIMITS.topicTag || /[.&]/.test(s.topicTag)))
    issues.push({ severity: "error", code: "topic_tag_invalid", message: `A topic tag is 1–${LIMITS.topicTag} characters with no periods or ampersands.`, field: "settings" });
  const hashtags = (req.text.match(/#[\p{L}\p{N}_]+/gu) ?? []).length;
  if (hashtags > 1) issues.push({ severity: "warning", code: "one_topic_per_post", message: "Threads shows one topic per post; the other # words stay plain text.", field: "text" });
  if (req.link && req.media.length) issues.push({ severity: "warning", code: "link_card_text_only", message: "Threads shows a link card on text-only posts; with media the URL stays in the text.", field: "link" });
  return issues;
}

export function createThreadsProvider(cfg: ProviderConfig): ProviderAdapter {
  const provider: ProviderAdapter = {
    key: "threads",
    displayName: "Threads",
    networks: ["threads"],
    accessSummary: ["See your Threads profile", "Publish posts and carousels as your profile", "Read replies to your posts and answer them", "Read views, likes and follower counts"],
    defaultScopes: DEFAULT_SCOPES,

    authorizationUrl({ state, redirectUri, scopes }: AuthorizeParams) {
      const u = new URL(OAUTH_AUTH);
      u.searchParams.set("client_id", cfg.clientId);
      u.searchParams.set("redirect_uri", redirectUri);
      u.searchParams.set("scope", [...new Set([...DEFAULT_SCOPES, ...(scopes ?? [])])].join(","));
      u.searchParams.set("response_type", "code");
      u.searchParams.set("state", state);
      return u.toString();
    },

    /** Short-lived code exchange, then the long-lived swap; Threads reports no granted-permission list. */
    async exchangeCode(code, redirectUri): Promise<Credential> {
      const short = await tokenCall<ShortToken>("/oauth/access_token", { client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: "authorization_code", redirect_uri: redirectUri, code }, "POST");
      const long = await tokenCall<LongToken>("/access_token", { grant_type: "th_exchange_token", client_secret: cfg.clientSecret, access_token: short.access_token! });
      const cred: Credential = { accessToken: long.access_token!, expiresAt: expiry(long.expires_in), scopes: DEFAULT_SCOPES, providerUserId: String(short.user_id ?? "unknown") };
      const u = await me(cred.accessToken).catch(() => ({}) as Me);
      return { ...cred, providerUserId: u.id ?? cred.providerUserId, providerUserName: u.username ? `@${u.username}` : u.name };
    },

    /** Refresh needs a token at least 24 h old; the platform refreshes a day before expiry, so it always is. */
    async refresh(cred) {
      const t = await tokenCall<LongToken>("/refresh_access_token", { grant_type: "th_refresh_token", access_token: cred.accessToken });
      return { ...cred, accessToken: t.access_token!, expiresAt: expiry(t.expires_in, cred.expiresAt) };
    },

    /** Threads has no revocation endpoint; the person removes RocketEase under Threads → Settings → Website permissions. */
    async revoke() {},

    /** One Threads login is exactly one profile. */
    async listChannels(cred) {
      const u = await me(cred.accessToken);
      if (!u.id) return [];
      return [{ remoteId: u.id, kind: "threads_profile", network: "threads", name: u.name ?? u.username ?? "Threads", handle: u.username ? `@${u.username}` : undefined, avatarUrl: u.threads_profile_picture_url, capabilities: capsFor(cred) }];
    },

    async describeChannel(cred, remoteId, kind: ChannelKind) {
      const c = (await provider.listChannels(cred)).find((ch) => ch.remoteId === remoteId && ch.kind === kind);
      if (!c) throw new ProviderError("This Threads profile is no longer available to your login.", { category: "deleted" });
      return c;
    },

    healthCheck(cred): Promise<HealthReport> {
      return probe(SCOPES.base, cred.scopes, () => me(cred.accessToken));
    },

    validate(channel, req): ValidationIssue[] {
      return [...validateAgainstCapabilities(channel.capabilities, req), ...threadsIssues(req)];
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

    /** Uninstall and delete callbacks are Meta-style signed_request posts, signed with the Threads app secret. */
    parseSignedRequest: (raw) => parseMetaSignedRequest(cfg, raw),
    // Webhooks (replies, mentions) need Advanced Access and a verified business: polling until then.
  };
  return provider;
}
