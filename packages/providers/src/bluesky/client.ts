/*
 * Bluesky (AT Protocol) client. Sign-in is an APP PASSWORD against the
 * account's service host (bsky.social by default): createSession returns a
 * short-lived access JWT and a refresh JWT, and refreshSession rotates both.
 * XRPC errors arrive as { error, message } with an HTTP status; the error
 * names are mapped onto the shared taxonomy here. Every number in LIMITS is
 * from the lexicons or docs.bsky.app, read 2026-09-05.
 */
import { createHash } from "node:crypto";
import type { Capabilities } from "../types";
import { ProviderError } from "../types";
import { categoryFromStatus, httpJson } from "../http";
import { retryAfterSeconds } from "../health";

export const DEFAULT_SERVICE = "https://bsky.social";
export const VIDEO_SERVICE = "https://video.bsky.app";
export const POST_COLLECTION = "app.bsky.feed.post";
export const now = () => new Date().toISOString();

export const LIMITS = {
  /** app.bsky.feed.post: maxGraphemes 300, maxLength 3000 bytes. */
  textGraphemes: 300,
  textBytes: 3000,
  /** app.bsky.embed.images: maxLength 4. The posts guide caps an image at 1,000,000 bytes (the lexicon allows 2,000,000; the smaller wins). */
  images: 4,
  imageBytes: 1_000_000,
  /** app.bsky.embed.video: maxSize 300000000 (video/mp4). */
  videoBytes: 300_000_000,
  /** Announced by Bluesky in 2025 (three minutes); no lexicon carries a duration, so the video service is the judge. */
  videoSeconds: 180,
  /** Repo writes: 5,000 points/hour, 35,000/day per account; a create costs 3. createSession: 30 per 5 min, 300/day. */
  writePointsPerHour: 5000,
  writePointsPerDay: 35_000,
  pointsPerCreate: 3,
};

export const CAPS = (): Capabilities => ({
  formats: ["text", "image", "carousel", "video"],
  scheduling: "internal",
  limits: {
    textMaxChars: LIMITS.textGraphemes,
    imagesMax: LIMITS.images,
    videoMaxSeconds: LIMITS.videoSeconds,
    videoMaxBytes: LIMITS.videoBytes,
    imageMaxBytes: LIMITS.imageBytes,
    mentions: true,
    firstComment: false,
    links: "inline",
    altText: true,
  },
  inbox: { comments: true, mentions: true, messages: false, reviews: false, reply: true },
  insights: { organic: true, audience: false },
  ads: { import: false, manage: false },
  ingestion: { webhooks: false, polling: true },
  disclosure: "caption",
  cover: "none",
  reasons: {
    firstComment: "A follow-up is a reply in the thread, not a separate first-comment field.",
    messages: "Bluesky chat needs an app password created with direct-message access and a second service (chat.bsky); not wired yet.",
    reviews: "Bluesky has no reviews.",
    ads: "Bluesky sells no ads.",
    webhooks: "AT Protocol has no per-account webhooks; the firehose is a whole-network stream, so notifications are polled.",
    audience: "Bluesky publishes follower counts but no audience demographics.",
    impressions: "Bluesky publishes no view or impression counts; likes, reposts, quotes and replies only.",
    disclosure: "Bluesky posts have no AI-content field; the label goes in the post text.",
    cover: "app.bsky.embed.video has no cover field; Bluesky picks its own frame.",
    textMaxChars: "300 graphemes, counted the way Bluesky counts them: an emoji or an accented letter is one.",
    quota: "Writes are limited to 5,000 points an hour and 35,000 a day per account; a post costs 3 points.",
  },
  checkedAt: now(),
});

export type Session = { accessJwt?: string; refreshJwt?: string; did?: string; handle?: string; active?: boolean; status?: string };
export type AtError = { error?: string; message?: string };

const PERMISSION = new Set(["AuthenticationRequired", "ExpiredToken", "InvalidToken", "AuthMissing", "AccountTakedown", "AccountDeactivated", "AccountSuspended", "AuthFactorTokenRequired"]);
const VALIDATION = new Set(["InvalidRequest", "BlobTooLarge", "InvalidMimeType", "InvalidSwap", "InvalidRecord", "UnsupportedDomain", "HandleNotFound"]);

/** XRPC error → shared taxonomy. Bluesky's throttle header is ratelimit-reset (an epoch), not Retry-After. */
export function mapAtError(status: number, body: AtError | string | null, opts: { headers?: Headers; ambiguous?: boolean } = {}): ProviderError {
  const b = typeof body === "string" || body === null ? ({ message: body ?? undefined } as AtError) : body;
  const name = b.error;
  let category = categoryFromStatus(status);
  if (status === 401 || (name && PERMISSION.has(name))) category = "permission";
  if (status === 429 || name === "RateLimitExceeded") category = "rate_limit";
  if (status === 404 || name === "RecordNotFound" || name === "NotFound" || name === "RepoNotFound") category = "deleted";
  if (name && VALIDATION.has(name)) category = "validation";
  const retryAfter = category === "rate_limit" ? rateLimitReset(opts.headers) : undefined;
  return new ProviderError(b.message ?? name ?? `Bluesky error (${status})`, { category, providerCode: name, ambiguous: opts.ambiguous ?? false, retryAfterSeconds: retryAfter });
}

export function rateLimitReset(headers: Headers | undefined, nowMs = Date.now()): number | undefined {
  const reset = Number(headers?.get("ratelimit-reset"));
  if (Number.isFinite(reset) && reset > 0) return Math.max(0, Math.round(reset - nowMs / 1000));
  return retryAfterSeconds(headers, 300);
}

export type Params = Record<string, string | string[] | undefined>;
export type XrpcInit = { method?: "GET" | "POST"; base?: string; token?: string; params?: Params; body?: unknown; rawBody?: Uint8Array<ArrayBuffer>; contentType?: string; timeoutMs?: number };

/** Repeated keys (uris=a&uris=b) are how XRPC takes arrays. */
export function query(params: Params | undefined): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v === undefined) continue;
    for (const item of Array.isArray(v) ? v : [v]) q.append(k, item);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export async function xrpc<T>(nsid: string, init: XrpcInit = {}): Promise<{ body: T; headers: Headers }> {
  const method = init.method ?? "GET";
  const headers: Record<string, string> = {};
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  if (init.rawBody) headers["Content-Type"] = init.contentType ?? "application/octet-stream";
  else if (init.body !== undefined) headers["Content-Type"] = "application/json";
  const res = await httpJson<T & AtError>(`${init.base ?? DEFAULT_SERVICE}/xrpc/${nsid}${query(init.params)}`, {
    method,
    headers,
    body: init.rawBody ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
    timeoutMs: init.timeoutMs ?? (method === "GET" ? 20_000 : 60_000),
  });
  if (res.status >= 400) throw mapAtError(res.status, res.body as AtError, { headers: res.headers, ambiguous: method !== "GET" && res.status >= 500 });
  return { body: res.body, headers: res.headers };
}

/** The access JWT carries its own expiry; reading it beats guessing a lifetime. */
export function jwtExpiry(jwt: string | undefined): string | undefined {
  const payload = jwt?.split(".")[1];
  if (!payload) return undefined;
  try {
    const exp = (JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: number }).exp;
    return typeof exp === "number" ? new Date(exp * 1000).toISOString() : undefined;
  } catch {
    return undefined;
  }
}

const TID_ALPHABET = "234567abcdefghijklmnopqrstuvwxyz";
const TID_BASE_US = BigInt(Date.parse("2023-01-01T00:00:00Z")) * BigInt(1000);
const TID_SPAN_US = BigInt(365 * 24 * 3600) * BigInt(1_000_000);

/**
 * A record key derived from the idempotency key. Posts take a TID-shaped key
 * (53-bit microsecond timestamp + 10-bit clock id, base32-sortable); deriving
 * both halves from a hash of the key, with the timestamp pinned inside 2023,
 * gives a syntactically valid TID that is the same on every attempt — so the
 * same key can never create a second post, and reconciliation is a lookup.
 */
export function tidFromKey(key: string): string {
  const h = createHash("sha256").update(key).digest();
  const ts = TID_BASE_US + (h.readBigUInt64BE(0) % TID_SPAN_US);
  const clock = (BigInt(h[8] & 0x03) << BigInt(8)) | BigInt(h[9]);
  let v = (ts << BigInt(10)) | clock;
  let s = "";
  for (let i = 0; i < 13; i++) {
    s = TID_ALPHABET[Number(v & BigInt(31))] + s;
    v >>= BigInt(5);
  }
  return s;
}

export const rkeyOf = (uri: string) => uri.split("/").pop() ?? uri;
export const postUrl = (handle: string | undefined, did: string, uri: string) => `https://bsky.app/profile/${(handle ?? did).replace(/^@/, "")}/post/${rkeyOf(uri)}`;
