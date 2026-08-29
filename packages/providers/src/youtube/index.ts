/*
 * YouTube adapter: one channel per authorization (Google's consent screen lets
 * the user pick which channel/brand account to grant). Publishing is a
 * resumable videos.insert (publish.ts), the inbox is commentThreads/comments
 * (inbox.ts) and insights come from the YouTube Analytics API (insights.ts).
 * There are no webhooks for comments, so verifyWebhook/parseWebhook are absent.
 */
import type { AuthorizeParams, ChannelDescriptor, ChannelKind, Credential, HealthReport, ProviderAdapter, ProviderConfig, PublishRequest, ValidationIssue } from "../types";
import { applyDisclosure } from "../disclosure";
import { ProviderError } from "../types";
import { form, httpJson } from "../http";
import { probe } from "../health";
import { validateAgainstCapabilities } from "../validate";
import { capsFor, googleAuthorizeUrl, googleTokenCall, isShortEligible, OAUTH_REVOKE, SCOPES, yt } from "./client";
import { findPublication, publicationStatus, publish, TITLE_MAX, titleFor } from "./publish";
import { fetchInbox, findReply, reply } from "./inbox";
import { fetchInsights } from "./insights";

const DEFAULT_SCOPES = [...SCOPES.read, ...SCOPES.upload, ...SCOPES.comments, ...SCOPES.analytics];

type ChannelRow = { id?: string; snippet?: { title?: string; customUrl?: string; thumbnails?: { default?: { url?: string }; medium?: { url?: string } } } };

const expiry = (s: number | undefined, fallback?: string) => (s ? new Date(Date.now() + s * 1000).toISOString() : fallback);
const tokenCall = googleTokenCall;

async function myChannels(cred: Credential): Promise<ChannelDescriptor[]> {
  const res = await yt<{ items?: ChannelRow[] }>("/channels?part=snippet&mine=true&maxResults=50", cred.accessToken);
  return (res.body.items ?? []).flatMap((c) =>
    c.id
      ? [{
          remoteId: c.id,
          kind: "youtube_channel" as const,
          network: "youtube" as const,
          name: c.snippet?.title ?? "YouTube channel",
          handle: c.snippet?.customUrl,
          avatarUrl: c.snippet?.thumbnails?.medium?.url ?? c.snippet?.thumbnails?.default?.url,
          capabilities: capsFor(cred),
        }]
      : [],
  );
}

/** Title/Shorts rules the generic capability validator cannot express. */
function youtubeIssues(req: Omit<PublishRequest, "idempotencyKey">): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const title = titleFor(req as PublishRequest);
  if (title === "Untitled") issues.push({ severity: "warning", code: "title_missing", message: `YouTube needs a title; the first line of your text is used (max ${TITLE_MAX} characters).`, field: "text" });
  const video = req.media.find((m) => m.mimeType.startsWith("video/"));
  if (req.format === "reel" && video && !isShortEligible(video.durationSeconds, video.width, video.height))
    issues.push({ severity: "error", code: "shorts_aspect_ratio", message: "A Short must be 3 minutes or shorter and square or vertical (width ≤ height).", field: "media" });
  return issues;
}

export function createYouTubeProvider(cfg: ProviderConfig): ProviderAdapter {
  const provider: ProviderAdapter = {
    key: "youtube",
    displayName: "YouTube",
    networks: ["youtube"],
    accessSummary: ["See the YouTube channel you choose", "Upload videos and Shorts to that channel", "Read and reply to comments on your videos", "Read your channel and video analytics"],
    defaultScopes: DEFAULT_SCOPES,

    /** access_type=offline + prompt=consent is what makes Google return a refresh token. */
    authorizationUrl({ state, redirectUri, scopes: extra }: AuthorizeParams) {
      return googleAuthorizeUrl({ clientId: cfg.clientId, redirectUri, state, scopes: [...DEFAULT_SCOPES, ...(extra ?? [])] });
    },

    async exchangeCode(code, redirectUri): Promise<Credential> {
      const t = await tokenCall({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: cfg.clientId, client_secret: cfg.clientSecret });
      const scopes = (t.scope ?? "").split(" ").filter(Boolean);
      const cred: Credential = { accessToken: t.access_token!, refreshToken: t.refresh_token, expiresAt: expiry(t.expires_in), scopes, providerUserId: "unknown" };
      const [first] = await myChannels(cred).catch(() => []);
      return { ...cred, providerUserId: first?.remoteId ?? "unknown", providerUserName: first?.name };
    },

    /** Google refresh tokens do not rotate; the refresh response carries no new one. */
    async refresh(cred) {
      if (!cred.refreshToken) throw new ProviderError("YouTube access expired; reconnect required.", { category: "permission", providerCode: "no_refresh_token" });
      const t = await tokenCall({ grant_type: "refresh_token", refresh_token: cred.refreshToken, client_id: cfg.clientId, client_secret: cfg.clientSecret });
      return { ...cred, accessToken: t.access_token!, refreshToken: t.refresh_token ?? cred.refreshToken, expiresAt: expiry(t.expires_in, cred.expiresAt), scopes: t.scope ? t.scope.split(" ").filter(Boolean) : cred.scopes };
    },

    /** Revoking either token kills the whole grant for this client. */
    async revoke(cred) {
      await httpJson(OAUTH_REVOKE, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form({ token: cred.refreshToken ?? cred.accessToken }) }).catch(() => undefined);
    },

    listChannels: (cred) => myChannels(cred),

    async describeChannel(cred, remoteId, kind: ChannelKind) {
      const c = (await myChannels(cred)).find((x) => x.remoteId === remoteId && x.kind === kind);
      if (!c) throw new ProviderError("This YouTube channel is no longer available to your login.", { category: "deleted" });
      return c;
    },

    healthCheck(cred): Promise<HealthReport> {
      return probe([...SCOPES.read, ...SCOPES.upload], cred.scopes, () => yt("/channels?part=id&mine=true", cred.accessToken));
    },

    validate(channel, req): ValidationIssue[] {
      return [...validateAgainstCapabilities(channel.capabilities, req), ...youtubeIssues(req)];
    },

    async publish(cred, channel, req: PublishRequest) {
      const errors = provider.validate(channel, req).filter((i) => i.severity === "error");
      if (errors.length) throw new ProviderError(errors[0].message, { category: "validation", providerCode: errors[0].code });
      const { request, emitted: disclosure } = applyDisclosure(channel, req);
      return { ...(await publish(cred, channel, request)), disclosure };
    },
    findPublication: (cred, channel, key) => findPublication(cred, channel, key),
    publicationStatus: (cred, _channel, remoteId) => publicationStatus(cred, remoteId),

    fetchInbox: (cred, channel, opts) => fetchInbox(cred, channel, opts),
    reply: (cred, channel, req) => reply(cred, channel, req),
    findReply: (cred, channel, key) => findReply(cred, channel, key),
    fetchInsights: (cred, channel, req) => fetchInsights(cred, channel, req),
    // No comment webhooks on YouTube (PubSubHubbub covers uploads only): polling.
  };
  return provider;
}
