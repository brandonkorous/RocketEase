/*
 * Bluesky adapter (AT Protocol). No OAuth: the person signs in with an APP
 * PASSWORD (Bluesky → Settings → Privacy and security → App passwords), which
 * the platform renders from `credentialsForm` and hands to `signIn`. A main
 * account password is refused by shape before it ever leaves the form. Free,
 * no review, so it is the first network that can be dogfooded live.
 */
import type { ChannelDescriptor, ChannelKind, Credential, HealthReport, ProviderAdapter, ProviderConfig, PublishRequest, ValidationIssue } from "../types";
import { applyDisclosure } from "../disclosure";
import { ProviderError } from "../types";
import { probe } from "../health";
import { validateAgainstCapabilities } from "../validate";
import { CAPS, DEFAULT_SERVICE, LIMITS, jwtExpiry, xrpc, type Session } from "./client";
import { graphemes, utf8Bytes } from "./richtext";
import { findPublication, publicationStatus, publish } from "./publish";
import { fetchInbox, findReply, reply } from "./inbox";
import { fetchInsights } from "./insights";

/** Bluesky app passwords are four groups of four; a main password never matches. */
export const APP_PASSWORD_RE = /^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/i;

type Profile = { did?: string; handle?: string; displayName?: string; avatar?: string };

const notOAuth = () => new ProviderError("Bluesky signs in with an app password, not OAuth; use the sign-in form.", { category: "validation", providerCode: "credentials_required" });

export function credentialFromSession(s: Session): Credential {
  if (!s.accessJwt || !s.refreshJwt || !s.did) throw new ProviderError("Bluesky returned an incomplete session", { category: "unknown" });
  return { accessToken: s.accessJwt, refreshToken: s.refreshJwt, expiresAt: jwtExpiry(s.accessJwt), scopes: [], providerUserId: s.did, providerUserName: s.handle ? `@${s.handle}` : undefined };
}

/** Post rules the generic validator gets wrong or has no field for: graphemes, bytes, one embed. */
export function blueskyIssues(req: Omit<PublishRequest, "idempotencyKey">): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const g = graphemes(req.text);
  if (g > LIMITS.textGraphemes) issues.push({ severity: "error", code: "text_too_long", message: `Text is ${g - LIMITS.textGraphemes} characters over Bluesky's ${LIMITS.textGraphemes} limit.`, field: "text" });
  if (utf8Bytes(req.text) > LIMITS.textBytes) issues.push({ severity: "error", code: "text_too_many_bytes", message: `Text is over Bluesky's ${LIMITS.textBytes.toLocaleString()}-byte limit.`, field: "text" });
  const videos = req.media.filter((m) => m.mimeType.startsWith("video/"));
  const images = req.media.filter((m) => m.mimeType.startsWith("image/"));
  if (videos.length && images.length) issues.push({ severity: "error", code: "mixed_media", message: "A Bluesky post carries either one video or up to four images, not both.", field: "media" });
  if (videos.length > 1) issues.push({ severity: "error", code: "too_many_videos", message: "A Bluesky post carries at most one video.", field: "media" });
  if (videos.some((v) => v.mimeType !== "video/mp4")) issues.push({ severity: "error", code: "video_format", message: "Bluesky takes MP4 video only.", field: "media" });
  if (req.link && req.media.length) issues.push({ severity: "warning", code: "link_card_text_only", message: "Bluesky shows a link card only on posts without media; here the URL stays in the text.", field: "link" });
  return issues;
}

export function createBlueskyProvider(cfg: ProviderConfig): ProviderAdapter {
  const service = cfg.extra?.service ?? DEFAULT_SERVICE;
  const session = (token: string) => xrpc<Session>("com.atproto.server.getSession", { base: service, token });
  const profile = (token: string, actor: string) => xrpc<Profile>("app.bsky.actor.getProfile", { base: service, token, params: { actor } });

  const provider: ProviderAdapter = {
    key: "bluesky",
    displayName: "Bluesky",
    networks: ["bluesky"],
    accessSummary: ["Publish posts as your account", "Read replies, mentions and quotes, and answer them", "Read likes, reposts and follower counts"],
    defaultScopes: [],

    credentialsForm: {
      title: "Sign in to Bluesky",
      intro: "Use an app password, never your account password. It is stored encrypted, and you can revoke it in Bluesky at any time.",
      fields: [
        { name: "identifier", label: "Handle", type: "text", placeholder: "brand.bsky.social", autoComplete: "username" },
        { name: "password", label: "App password", type: "password", placeholder: "xxxx-xxxx-xxxx-xxxx", autoComplete: "off", help: "Bluesky → Settings → Privacy and security → App passwords." },
      ],
      help: { label: "Create an app password on Bluesky", href: "https://bsky.app/settings/app-passwords" },
    },

    async signIn(values): Promise<Credential> {
      const identifier = (values.identifier ?? "").trim().replace(/^@/, "");
      const password = (values.password ?? "").trim();
      if (!identifier) throw new ProviderError("Enter your Bluesky handle.", { category: "validation", providerCode: "identifier_required" });
      if (!APP_PASSWORD_RE.test(password)) throw new ProviderError("That is not an app password. Bluesky app passwords look like xxxx-xxxx-xxxx-xxxx; create one under Settings → Privacy and security → App passwords.", { category: "validation", providerCode: "app_password_required" });
      const res = await xrpc<Session>("com.atproto.server.createSession", { method: "POST", base: service, body: { identifier, password } });
      return credentialFromSession(res.body);
    },

    authorizationUrl() {
      throw notOAuth();
    },
    async exchangeCode() {
      throw notOAuth();
    },

    /** refreshSession rotates both tokens; the returned pair must be persisted. */
    async refresh(cred) {
      if (!cred.refreshToken) throw new ProviderError("Bluesky session expired; sign in again.", { category: "permission", providerCode: "no_refresh_token" });
      const res = await xrpc<Session>("com.atproto.server.refreshSession", { method: "POST", base: service, token: cred.refreshToken });
      return { ...credentialFromSession({ ...res.body, did: res.body.did ?? cred.providerUserId }), providerUserName: res.body.handle ? `@${res.body.handle}` : cred.providerUserName };
    },

    async revoke(cred) {
      if (!cred.refreshToken) return;
      await xrpc("com.atproto.server.deleteSession", { method: "POST", base: service, token: cred.refreshToken }).catch(() => undefined);
    },

    /** One app password is exactly one account. */
    async listChannels(cred) {
      const p = (await profile(cred.accessToken, cred.providerUserId)).body;
      if (!p.did) return [];
      return [{ remoteId: p.did, kind: "bluesky_account", network: "bluesky", name: p.displayName || p.handle || "Bluesky", handle: p.handle ? `@${p.handle}` : undefined, avatarUrl: p.avatar, capabilities: CAPS() }];
    },

    async describeChannel(cred, remoteId, kind: ChannelKind) {
      const c = (await provider.listChannels(cred)).find((ch) => ch.remoteId === remoteId && ch.kind === kind);
      if (!c) throw new ProviderError("This Bluesky account is no longer available to your login.", { category: "deleted" });
      return c;
    },

    healthCheck(cred): Promise<HealthReport> {
      return probe([], cred.scopes, () => session(cred.accessToken));
    },

    /** The generic length check counts UTF-16 units; Bluesky counts graphemes, so that one issue is replaced. */
    validate(channel: ChannelDescriptor, req): ValidationIssue[] {
      const generic = validateAgainstCapabilities(channel.capabilities, req).filter((i) => i.code !== "text_too_long");
      return [...generic, ...blueskyIssues(req)];
    },

    async publish(cred, channel, req: PublishRequest) {
      const errors = provider.validate(channel, req).filter((i) => i.severity === "error");
      if (errors.length) throw new ProviderError(errors[0].message, { category: "validation", providerCode: errors[0].code });
      const { request, emitted: disclosure } = applyDisclosure(channel, req);
      return { ...(await publish(service, cred, channel, request)), disclosure };
    },
    findPublication: (cred, channel, key) => findPublication(service, cred, channel, key),
    publicationStatus: (cred, channel, remoteId) => publicationStatus(service, cred, channel, remoteId),

    fetchInbox: (cred, channel, opts) => fetchInbox(service, cred, channel, opts),
    reply: (cred, channel, req) => reply(service, cred, channel, req),
    findReply: (cred, channel, lookup) => findReply(service, cred, channel, lookup),
    fetchInsights: (cred, channel, req) => fetchInsights(service, cred, channel, req),
    // No webhooks: the AT Protocol firehose is a whole-network stream, not a per-account callback.
  };
  return provider;
}
