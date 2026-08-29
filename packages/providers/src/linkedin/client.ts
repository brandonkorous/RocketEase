/*
 * LinkedIn REST client (api.linkedin.com/rest, versioned) plus error mapping
 * and the per-channel capability declarations. Everything LinkedIn-specific
 * that more than one module needs lives here.
 */
import type { Capabilities, Credential } from "../types";
import { ProviderError } from "../types";
import { categoryFromStatus, httpJson } from "../http";
import { retryAfterSeconds } from "../health";

export const REST = "https://api.linkedin.com/rest";
export const OAUTH = "https://www.linkedin.com/oauth/v2";
export const VERSION = "202411";
export const now = () => new Date().toISOString();

/** Scopes each feature needs (Community Management API). */
export const SCOPES = {
  identity: ["openid", "profile"],
  orgRead: ["r_organization_social"],
  orgWrite: ["w_organization_social"],
  orgAdmin: ["rw_organization_admin"],
  member: ["w_member_social"],
};

export const ORG_CAPS = (): Capabilities => ({
  formats: ["text", "image", "carousel", "video", "document"],
  scheduling: "internal",
  limits: { textMaxChars: 3000, imagesMax: 20, videoMaxSeconds: 600, mentions: true, firstComment: true, links: "inline", altText: true, videoMaxBytes: 5 * 1024 * 1024 * 1024 },
  inbox: { comments: true, mentions: true, messages: false, reviews: false, reply: true },
  insights: { organic: true, audience: true },
  ads: { import: false, manage: false },
  ingestion: { webhooks: false, polling: true },
  disclosure: "caption",
  reasons: {
    messages: "LinkedIn does not expose Page or member messaging to third-party apps.",
    disclosure: "LinkedIn's AI label is a member-facing control with no Posts API field; the label goes in the post text.",
    reviews: "LinkedIn Pages have no reviews.",
    webhooks: "LinkedIn offers no webhooks for Page comments or mentions; items are polled.",
    ads: "The LinkedIn Marketing (Ads) API is a separate partner-gated product this adapter does not integrate.",
  },
  checkedAt: now(),
});

export const MEMBER_CAPS = (): Capabilities => ({
  ...ORG_CAPS(),
  inbox: { comments: false, mentions: false, messages: false, reviews: false, reply: false },
  insights: { organic: false, audience: false },
  ads: { import: false, manage: false },
  reasons: {
    ...ORG_CAPS().reasons,
    comments: "Reading comments on a member's own posts requires the restricted r_member_social permission.",
    mentions: "LinkedIn reports mention notifications for organization Pages only.",
    reply: "Replying needs comment access on member posts, which is the same restricted r_member_social permission.",
    messages: "LinkedIn does not expose member messaging to third-party apps.",
    insights: "LinkedIn provides analytics for organization Pages only, not member profiles.",
    audience: "LinkedIn provides follower analytics for organization Pages only, not member profiles.",
  },
});

export type LiError = { message?: string; serviceErrorCode?: number; code?: string; status?: number };

/** Map LinkedIn responses onto the shared taxonomy (integrations.md "Publishing and replies"). */
export function mapLinkedInError(status: number, body: LiError | string | null, opts: { headers?: Headers; ambiguous?: boolean } = {}): ProviderError {
  const b = (typeof body === "string" || body === null ? { message: body ?? undefined } : body) as LiError;
  let category = categoryFromStatus(status);
  const code = b.code ?? (b.serviceErrorCode !== undefined ? String(b.serviceErrorCode) : undefined);
  if (status === 401 || status === 403 || code === "REVOKED_ACCESS_TOKEN" || code === "EXPIRED_ACCESS_TOKEN") category = "permission";
  if (b.serviceErrorCode === 65600 || b.serviceErrorCode === 65601) category = "permission"; // invalid / expired token
  if (status === 429) category = "rate_limit";
  if (status === 400 || status === 422) category = "validation";
  if (status === 404 || status === 410) category = "deleted";
  const retryAfter = category === "rate_limit" ? retryAfterSeconds(opts.headers, 3600) : undefined;
  return new ProviderError(b.message ?? `LinkedIn API error (${status})`, { category, providerCode: code, ambiguous: opts.ambiguous ?? false, retryAfterSeconds: retryAfter });
}

export type LiInit = { method?: "GET" | "POST" | "DELETE"; body?: unknown; headers?: Record<string, string>; base?: string };

/** Versioned REST call. Mutating 5xx / timeouts are ambiguous — reconcile before retrying. */
export async function li<T>(path: string, token: string, init: LiInit = {}): Promise<{ body: T; headers: Headers }> {
  const method = init.method ?? "GET";
  const res = await httpJson<T & LiError>(`${init.base ?? REST}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "LinkedIn-Version": VERSION, "X-Restli-Protocol-Version": "2.0.0", "Content-Type": "application/json", ...(init.headers ?? {}) },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    timeoutMs: method === "GET" ? 20_000 : 60_000,
  });
  if (res.status >= 400) throw mapLinkedInError(res.status, res.body, { headers: res.headers, ambiguous: method !== "GET" && res.status >= 500 });
  return { body: res.body, headers: res.headers };
}

export const scopesOf = (cred: Credential) => cred.scopes;
export const urnId = (urn: string) => urn.split(":").pop() ?? urn;
export const postUrl = (urn: string) => `https://www.linkedin.com/feed/update/${urn}`;
