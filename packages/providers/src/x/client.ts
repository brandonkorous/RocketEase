/*
 * X (Twitter) API v2 client. Two hosts are involved:
 *   api.x.com/2                       — posts, users, mentions, DMs, metrics
 *   upload.twitter.com/1.1/media/*    — chunked media upload (v2 has no
 *                                       equivalent for the chunked video flow)
 * Errors arrive either as RFC 7807 problem objects ({title, detail, type}) or
 * as the legacy {errors:[{message,code}]} envelope; both are mapped here.
 * Capabilities are derived from the scopes the account actually granted.
 */
import type { Capabilities, Credential } from "../types";
import { ProviderError } from "../types";
import { categoryFromStatus, httpJson } from "../http";
import { retryAfterSeconds } from "../health";

export const API = "https://api.x.com/2";
export const UPLOAD = "https://upload.twitter.com/1.1";
export const OAUTH_AUTH = "https://x.com/i/oauth2/authorize";
export const OAUTH_TOKEN = `${API}/oauth2/token`;
export const OAUTH_REVOKE = `${API}/oauth2/revoke`;
export const now = () => new Date().toISOString();
export const postUrl = (handle: string | undefined, id: string) => `https://x.com/${(handle ?? "i").replace(/^@/, "")}/status/${id}`;

export const SCOPES = {
  base: ["tweet.read", "tweet.write", "users.read", "offline.access"],
  /** Required by X for media upload under OAuth 2.0 user context. */
  media: ["media.write"],
  dmRead: ["dm.read"],
  dmWrite: ["dm.write"],
};

/**
 * 280 characters is the limit the API enforces for a standard account. X
 * Premium raises it, but no v2 endpoint reports an account's own ceiling, so
 * the adapter declares 280 and lets the provider reject anything longer.
 */
export const TEXT_MAX = 280;

export function capsFor(cred: Credential): Capabilities {
  const has = (list: string[]) => list.every((s) => cred.scopes.includes(s));
  const dm = has(SCOPES.dmRead);
  const reasons: Record<string, string> = {
    reviews: "X has no reviews.",
    mentions: "The mentions timeline is not part of X's free access tier; the inbox needs at least the paid tier.",
    firstComment: "A follow-up post is published as a reply in the thread rather than a separate first-comment field.",
    textMaxChars: "280 characters is the standard account limit; X Premium raises it but no API reports an account's own ceiling.",
    webhooks: "Real-time delivery on X is the Account Activity API, a separately gated product; mentions and DMs are polled here.",
    ads: "The X Ads API is a separate product this adapter does not integrate.",
    disclosure: "The X API v2 tweet endpoint has no AI-content field; the label goes in the post text.",
    saves: "X does not report bookmarks for other people's interactions with your posts.",
  };
  if (!dm) reasons.messages = "Reading direct messages needs the dm.read scope, which the account did not grant.";
  if (!has(SCOPES.dmWrite)) reasons.reply = "Replying to direct messages needs the dm.write scope; replies to mentions only need tweet.write.";
  if (!has(SCOPES.media)) reasons.formats = "Attaching images or video needs the media.write scope; text-only posts still work.";
  return {
    formats: has(SCOPES.media) ? ["text", "image", "carousel", "video"] : ["text"],
    scheduling: "internal",
    limits: {
      textMaxChars: TEXT_MAX,
      imagesMax: 4,
      videoMaxSeconds: 140,
      videoMaxBytes: 512 * 1024 * 1024,
      imageMaxBytes: 5 * 1024 * 1024,
      mentions: true,
      firstComment: false,
      links: "inline",
      altText: true,
    },
    inbox: { comments: true, mentions: true, messages: dm, reviews: false, reply: true },
    insights: { organic: true, audience: true },
    ads: { import: false, manage: false },
    ingestion: { webhooks: false, polling: true },
    disclosure: "caption",
    reasons,
    checkedAt: now(),
  };
}

export type XError = { title?: string; detail?: string; type?: string; status?: number; reason?: string; errors?: { message?: string; code?: number; title?: string; detail?: string }[] };

const DUPLICATE = /duplicate content/i;

/** Map an X response onto the shared taxonomy (integrations.md "Publishing and replies"). */
export function mapXError(status: number, body: XError | string | null, opts: { headers?: Headers; ambiguous?: boolean } = {}): ProviderError {
  const b = typeof body === "string" || body === null ? ({ detail: body ?? undefined } as XError) : body;
  const first = b.errors?.[0];
  const detail = b.detail ?? b.title ?? first?.detail ?? first?.message ?? first?.title;
  let category = categoryFromStatus(status);
  if (status === 401 || b.reason === "client-not-enrolled" || first?.code === 89 || first?.code === 32) category = "permission";
  if (status === 403) category = DUPLICATE.test(detail ?? "") || first?.code === 187 || first?.code === 226 ? "policy" : "permission";
  if (status === 429 || first?.code === 88) category = "rate_limit";
  if (first?.code === 144 || first?.code === 34) category = "deleted";
  if (b.title === "Not Found Error") category = "deleted";
  if (b.title === "Invalid Request" || first?.code === 186) category = "validation";
  const retryAfter = category === "rate_limit" ? rateLimitReset(opts.headers) : undefined;
  const code = first?.code !== undefined ? String(first.code) : (b.type ?? b.title);
  return new ProviderError(detail ?? `X API error (${status})`, { category, providerCode: code, ambiguous: opts.ambiguous ?? false, retryAfterSeconds: retryAfter });
}

/** X signals throttling with x-rate-limit-reset (an absolute epoch), not Retry-After. */
export function rateLimitReset(headers: Headers | undefined, nowMs = Date.now()): number | undefined {
  const reset = Number(headers?.get("x-rate-limit-reset"));
  if (Number.isFinite(reset) && reset > 0) return Math.max(0, Math.round(reset - nowMs / 1000));
  return retryAfterSeconds(headers, 900);
}

export type XInit = { method?: "GET" | "POST" | "DELETE" | "PUT"; body?: unknown; base?: string };

export async function x<T>(path: string, token: string, init: XInit = {}): Promise<{ body: T; headers: Headers }> {
  const method = init.method ?? "GET";
  const res = await httpJson<T & XError>(`${init.base ?? API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    timeoutMs: method === "GET" ? 20_000 : 60_000,
  });
  const b = res.body as XError;
  // v2 can return 200 with a partial-error envelope on reads; only treat it as
  // fatal when no data came back at all.
  const emptyWithErrors = res.status === 200 && b?.errors?.length && (res.body as { data?: unknown })?.data === undefined;
  if (res.status >= 400 || emptyWithErrors) throw mapXError(res.status === 200 ? 404 : res.status, b, { headers: res.headers, ambiguous: method !== "GET" && res.status >= 500 });
  return { body: res.body, headers: res.headers };
}

export const basicAuth = (clientId: string, clientSecret: string) => `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
