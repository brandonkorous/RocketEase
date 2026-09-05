/*
 * YouTube clients. Three hosts are involved:
 *   www.googleapis.com/youtube/v3        — Data API (channels, videos, comments)
 *   www.googleapis.com/upload/youtube/v3 — resumable video upload
 *   youtubeanalytics.googleapis.com/v2   — YouTube Analytics (daily reports)
 * Google returns a uniform error envelope: { error: { code, message, errors:[{reason}] } }.
 * Capabilities are derived from the scopes the channel owner actually granted.
 */
import type { Capabilities, Credential } from "../types";
import { ProviderError } from "../types";
import { categoryFromStatus, form, httpJson } from "../http";
import { retryAfterSeconds } from "../health";

export const DATA = "https://www.googleapis.com/youtube/v3";
export const UPLOAD = "https://www.googleapis.com/upload/youtube/v3";
export const ANALYTICS = "https://youtubeanalytics.googleapis.com/v2";
export const OAUTH_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
export const OAUTH_TOKEN = "https://oauth2.googleapis.com/token";
export const OAUTH_REVOKE = "https://oauth2.googleapis.com/revoke";
export const now = () => new Date().toISOString();
export const videoUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;

/** Google OAuth scopes per feature (YouTube Data API v3 / YouTube Analytics API). */
export const SCOPES = {
  /** Read the channel list; required for everything. */
  read: ["https://www.googleapis.com/auth/youtube.readonly"],
  /** videos.insert — the only way to publish. */
  upload: ["https://www.googleapis.com/auth/youtube.upload"],
  /** commentThreads.list / comments.insert both need force-ssl, not plain youtube. */
  comments: ["https://www.googleapis.com/auth/youtube.force-ssl"],
  /** reports.query on channel==MINE. */
  analytics: ["https://www.googleapis.com/auth/yt-analytics.readonly"],
};

/*
 * Limits are the documented Data API values. Video length/size are the account
 * ceilings for a VERIFIED channel; unverified channels are capped at 15 minutes
 * and we cannot read verification state from the API, so that is a warning the
 * publish worker surfaces from the provider error rather than a hard limit.
 */
export function capsFor(cred: Credential): Capabilities {
  const has = (list: string[]) => list.every((s) => cred.scopes.includes(s));
  const reasons: Record<string, string> = {
    messages: "YouTube has no API for direct messages.",
    reviews: "YouTube has no reviews.",
    firstComment: "The Data API cannot post a comment as the channel on its own upload at publish time; comments.insert is used for replies only.",
    mentions: "YouTube has no mentions feed for a channel.",
    altText: "YouTube has no alt-text field for a video.",
    ads: "Google Ads is a separate product this adapter does not integrate.",
    links: "Description links are plain text; YouTube renders them but they carry no attachment metadata.",
    webhooks: "YouTube's only push channel (PubSubHubbub on the uploads feed) reports new uploads, not comments; the inbox is polled.",
    quota: "The Data API allows 10,000 units a day by default and an upload costs about 1,600, so roughly six uploads a day until Google grants an increase.",
    cover: "Custom thumbnails go through thumbnails.set, which only works on a channel with a verified phone number — a state the API does not expose. Not sent yet; YouTube picks its own frame.",
  };
  if (!has(SCOPES.comments)) {
    reasons.comments = "Reading comments needs the youtube.force-ssl scope.";
    reasons.reply = "Replying to comments needs the youtube.force-ssl scope.";
  }
  if (!has(SCOPES.analytics)) reasons.insights = "Daily analytics need the yt-analytics.readonly scope.";
  if (!has(SCOPES.upload)) reasons.formats = "Publishing needs the youtube.upload scope.";
  return {
    formats: has(SCOPES.upload) ? ["video", "reel"] : [],
    scheduling: "native",
    limits: {
      // Description limit; the title is validated separately (100 chars) in publish.ts.
      textMaxChars: 5000,
      imagesMax: 0,
      videoMaxSeconds: 12 * 3600,
      videoMaxBytes: 256 * 1024 * 1024 * 1024,
      hashtagsMax: 60,
      mentions: false,
      firstComment: false,
      links: "inline",
      altText: false,
    },
    inbox: { comments: has(SCOPES.comments), mentions: false, messages: false, reviews: false, reply: has(SCOPES.comments) },
    insights: { organic: has(SCOPES.analytics), audience: has(SCOPES.analytics) },
    ads: { import: false, manage: false },
    ingestion: { webhooks: false, polling: true },
    disclosure: "api",
    cover: "none",
    reasons,
    checkedAt: now(),
  };
}

export type GoogleError = { error?: { code?: number; message?: string; status?: string; errors?: { reason?: string; message?: string; domain?: string }[] } };

export type GoogleTokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string } & GoogleError;

/** Google's shared OAuth token endpoint. Also used by the GA4 tracking source (lib/tracking/ga4.ts). */
export async function googleTokenCall(body: Record<string, string>): Promise<GoogleTokenResponse> {
  const res = await httpJson<GoogleTokenResponse>(OAUTH_TOKEN, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form(body) });
  if (res.status >= 400 || !res.body.access_token) throw mapYouTubeError(res.status === 200 ? 401 : res.status, res.body, { headers: res.headers });
  return res.body;
}

/** Google consent URL. `offline` + `consent` is what makes Google return a refresh token. */
export function googleAuthorizeUrl(input: { clientId: string; redirectUri: string; state: string; scopes: string[] }) {
  const u = new URL(OAUTH_AUTH);
  u.searchParams.set("client_id", input.clientId);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", input.redirectUri);
  u.searchParams.set("state", input.state);
  u.searchParams.set("scope", [...new Set(input.scopes)].join(" "));
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("include_granted_scopes", "true");
  return u.toString();
}

const PERMISSION_REASONS = new Set([
  "authError",
  "forbidden",
  "insufficientPermissions",
  "youtubeSignupRequired",
  "channelClosed",
  "channelSuspended",
  "accountDelegationForbidden",
  "liveStreamingNotEnabled",
]);
const RATE_REASONS = new Set(["quotaExceeded", "rateLimitExceeded", "userRateLimitExceeded", "dailyLimitExceeded", "uploadLimitExceeded"]);
const POLICY_REASONS = new Set(["forbiddenLicense", "invalidVideoGamingContentDetected", "uploadLimitExceeded", "failedPrecondition"]);

/** Map a Google API response onto the shared taxonomy (integrations.md "Publishing and replies"). */
export function mapYouTubeError(status: number, body: GoogleError | string | null, opts: { headers?: Headers; ambiguous?: boolean } = {}): ProviderError {
  const err = typeof body === "string" || body === null ? undefined : body.error;
  const reason = err?.errors?.[0]?.reason;
  let category = categoryFromStatus(status);
  if (reason && PERMISSION_REASONS.has(reason)) category = "permission";
  if (reason && RATE_REASONS.has(reason)) category = "rate_limit";
  if (reason && POLICY_REASONS.has(reason)) category = "policy";
  if (reason?.startsWith("invalid") || reason === "mediaBodyRequired" || reason === "videoTitleEmpty") category = "validation";
  if (reason === "videoNotFound" || reason === "commentNotFound" || reason === "channelNotFound" || reason === "notFound") category = "deleted";
  if (reason === "backendError" || reason === "internalError" || reason === "transientError") category = "temporary";
  // Quota exhaustion resets at midnight Pacific; there is no Retry-After header.
  const fallback = reason === "quotaExceeded" || reason === "dailyLimitExceeded" ? 3600 : 60;
  const retryAfter = category === "rate_limit" ? retryAfterSeconds(opts.headers, fallback) : undefined;
  const message = err?.message ?? (typeof body === "string" ? body : undefined) ?? `YouTube API error (${status})`;
  return new ProviderError(message, { category, providerCode: reason ?? (err?.status || undefined), ambiguous: opts.ambiguous ?? false, retryAfterSeconds: retryAfter });
}

export type YtInit = { method?: "GET" | "POST" | "PUT" | "DELETE"; body?: unknown; base?: string; headers?: Record<string, string> };

/** Data / Analytics API call. Mutating 5xx and timeouts are ambiguous — reconcile before retrying. */
export async function yt<T>(path: string, token: string, init: YtInit = {}): Promise<{ body: T; headers: Headers }> {
  const method = init.method ?? "GET";
  const res = await httpJson<T & GoogleError>(`${init.base ?? DATA}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    timeoutMs: method === "GET" ? 20_000 : 60_000,
  });
  if (res.status >= 400) throw mapYouTubeError(res.status, res.body as GoogleError, { headers: res.headers, ambiguous: method !== "GET" && res.status >= 500 });
  return { body: res.body, headers: res.headers };
}

/** YouTube treats a video as a Short when it is <= 3 minutes and not landscape. */
export const isShortEligible = (durationSeconds?: number, width?: number, height?: number) =>
  (durationSeconds ?? 0) <= 180 && (width === undefined || height === undefined || width <= height);
