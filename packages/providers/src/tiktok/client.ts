/*
 * TikTok clients. Two hosts are involved:
 *   open.tiktokapis.com  — Login Kit, Display API, Content Posting API
 *                          (body: { data, error: { code, message } })
 *   business-api.tiktok.com/open_api/v1.3/business — Business Account API
 *                          (comments, daily insights; body: { code, message, data })
 * Capabilities are derived from the scopes the account actually granted.
 */
import type { Capabilities, Credential } from "../types";
import { ProviderError } from "../types";
import { categoryFromStatus, httpJson } from "../http";
import { retryAfterSeconds } from "../health";

export const API = "https://open.tiktokapis.com/v2";
export const BUSINESS = "https://business-api.tiktok.com/open_api/v1.3";
export const now = () => new Date().toISOString();

export const SCOPES = {
  base: ["user.info.basic", "user.info.profile", "user.info.stats", "video.list", "video.publish", "video.upload"],
  comments: ["comment.list"],
  reply: ["comment.list.manage"],
  insights: ["video.insights"],
};

export function capsFor(cred: Credential): Capabilities {
  const has = (list: string[]) => list.every((s) => cred.scopes.includes(s));
  const reasons: Record<string, string> = {
    links: "TikTok captions don't render links.",
    firstComment: "Not exposed by the Content Posting API.",
    messages: "TikTok does not expose direct messages to third-party apps.",
    mentions: "TikTok has no API for mentions of an account.",
    reviews: "TikTok has no reviews.",
    altText: "TikTok has no alt-text field.",
    ads: "TikTok Ads is a separate Marketing API product this adapter does not integrate.",
    webhooks: "TikTok webhooks report publish status and authorization changes only; comments are polled.",
    publishing: "Until TikTok approves the app for the Content Posting API, an unaudited app can only post with SELF_ONLY privacy to private accounts.",
  };
  if (!has(SCOPES.comments)) reasons.comments = "Reading comments needs the Business Account comment.list scope.";
  if (!has(SCOPES.reply)) reasons.reply = "Replying to comments needs the Business Account comment.list.manage scope.";
  if (!has(SCOPES.insights)) reasons.audience = "Daily account insights need the Business Account video.insights scope; only lifetime totals are available.";
  return {
    formats: ["video", "carousel"],
    scheduling: "internal",
    limits: { textMaxChars: 2200, imagesMax: 35, videoMaxSeconds: 600, hashtagsMax: 30, mentions: true, firstComment: false, links: "none", altText: false, videoMaxBytes: 4 * 1024 * 1024 * 1024 },
    inbox: { comments: has(SCOPES.comments), mentions: false, messages: false, reviews: false, reply: has(SCOPES.reply) },
    insights: { organic: true, audience: has(SCOPES.insights) },
    ads: { import: false, manage: false },
    ingestion: { webhooks: true, polling: true },
    disclosure: "api",
    reasons,
    checkedAt: now(),
  };
}

export type TtError = { error?: { code?: string; message?: string; log_id?: string } };
export type BizBody<T> = { code?: number; message?: string; data?: T; request_id?: string };

const PERMISSION = new Set(["access_token_invalid", "scope_not_authorized", "scope_permission_missed", "token_not_authorized_for_specified_scope", "unaudited_client_can_only_post_to_private_accounts"]);
const POLICY = new Set(["spam_risk_too_many_posts", "spam_risk_user_banned_from_posting", "spam_risk_too_many_pending_share", "url_ownership_unverified"]);

/** open.tiktokapis.com error envelope → taxonomy. */
export function mapTikTokError(status: number, body: TtError | null, opts: { headers?: Headers; ambiguous?: boolean } = {}): ProviderError {
  const code = body?.error?.code;
  let category = categoryFromStatus(status);
  if (code && PERMISSION.has(code)) category = "permission";
  if (code === "rate_limit_exceeded" || code === "reached_active_user_cap" || status === 429) category = "rate_limit";
  if (code?.startsWith("invalid_")) category = "validation";
  if (code && POLICY.has(code)) category = "policy";
  if (code === "internal_error") category = "temporary";
  const retryAfter = category === "rate_limit" ? retryAfterSeconds(opts.headers, 60) : undefined;
  return new ProviderError(body?.error?.message ?? `TikTok API error (${status})`, { category, providerCode: code, ambiguous: opts.ambiguous ?? false, retryAfterSeconds: retryAfter });
}

/** business-api.tiktok.com numeric codes → taxonomy (0 = ok, 401xx = auth, 40001 = params, 5xxxx = server). */
export function mapBusinessError(status: number, body: BizBody<unknown> | null, opts: { headers?: Headers; ambiguous?: boolean } = {}): ProviderError {
  const code = body?.code;
  let category = categoryFromStatus(status);
  if (code !== undefined) {
    if (code >= 40100 && code < 40200) category = "permission";
    else if (code === 40001 || code === 40002) category = "validation";
    else if (code === 40100 || code === 40104) category = "permission";
    else if (code === 40016 || code === 40022 || status === 429) category = "rate_limit";
    else if (code >= 50000) category = "temporary";
  }
  if (status === 429) category = "rate_limit";
  const retryAfter = category === "rate_limit" ? retryAfterSeconds(opts.headers, 60) : undefined;
  return new ProviderError(body?.message ?? `TikTok Business API error (${status})`, { category, providerCode: code !== undefined ? String(code) : undefined, ambiguous: opts.ambiguous ?? false, retryAfterSeconds: retryAfter });
}

/** open.tiktokapis.com call; POST when a body is given. */
export async function tt<T>(path: string, token: string, body?: unknown): Promise<T> {
  const mutating = body !== undefined;
  const res = await httpJson<T & TtError>(`${API}${path}`, {
    method: mutating ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
    body: mutating ? JSON.stringify(body) : undefined,
    timeoutMs: 60_000,
  });
  const err = (res.body as TtError)?.error;
  if (res.status >= 400 || (err?.code && err.code !== "ok")) throw mapTikTokError(res.status, res.body as TtError, { headers: res.headers, ambiguous: mutating && res.status >= 500 });
  return res.body;
}

/** Business Account API call; `Access-Token` header, JSON body for POST, query string for GET. */
export async function biz<T>(path: string, token: string, init: { query?: Record<string, string>; body?: unknown } = {}): Promise<T> {
  const mutating = init.body !== undefined;
  const qs = init.query ? `?${new URLSearchParams(init.query).toString()}` : "";
  const res = await httpJson<BizBody<T>>(`${BUSINESS}${path}${qs}`, {
    method: mutating ? "POST" : "GET",
    headers: { "Access-Token": token, "Content-Type": "application/json" },
    body: mutating ? JSON.stringify(init.body) : undefined,
    timeoutMs: 30_000,
  });
  if (res.status >= 400 || (res.body?.code !== undefined && res.body.code !== 0)) throw mapBusinessError(res.status, res.body, { headers: res.headers, ambiguous: mutating && res.status >= 500 });
  return (res.body?.data ?? {}) as T;
}
