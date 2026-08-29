/*
 * Google Business Profile clients. Three hosts are involved, and they are NOT
 * the same API version:
 *   mybusinessaccountmanagement.googleapis.com/v1   — accounts.list
 *   mybusinessbusinessinformation.googleapis.com/v1 — accounts.locations.list (readMask required)
 *   mybusiness.googleapis.com/v4                    — reviews list/get and reviews/*\/reply
 * Reviews were never migrated off v4; that endpoint is still the only way to
 * read or answer a review. Errors use Google's uniform envelope, so the mapping
 * is the YouTube adapter's, with a Business Profile fallback message.
 */
import type { Capabilities, Credential } from "../types";
import { httpJson } from "../http";
import { mapYouTubeError, type GoogleError } from "../youtube/client";

export const ACCOUNTS = "https://mybusinessaccountmanagement.googleapis.com/v1";
export const INFO = "https://mybusinessbusinessinformation.googleapis.com/v1";
export const REVIEWS = "https://mybusiness.googleapis.com/v4";
export const now = () => new Date().toISOString();

/** One scope covers the whole product; Google has no finer grain here. */
export const SCOPES = { manage: ["https://www.googleapis.com/auth/business.manage"] };

/** Fields we ask locations.list for. readMask is REQUIRED by the v1 API. */
export const LOCATION_READ_MASK = "name,title,storeCode,storefrontAddress,websiteUri,metadata";

/** reviews.updateReply rejects a comment over 4096 bytes. */
export const REPLY_MAX_BYTES = 4096;

const REASONS: Record<string, string> = {
  formats: "This pass covers review management only. Business Profile local posts are a separate surface and are not published from here.",
  scheduling: "There is nothing to schedule: a review reply is sent when you send it.",
  comments: "Google Business Profile has no comments; the only public conversation on a location is a review.",
  mentions: "Google Business Profile has no mentions feed.",
  messages: "Business Messages (the chat product) was shut down by Google and has no replacement API.",
  firstComment: "Nothing is published to a location from here, so there is no first comment.",
  links: "A review reply is plain text; Google renders no link metadata in it.",
  altText: "Replies carry no media, so there is no alt text.",
  insights: "Location performance lives in the separate Business Profile Performance API, which this adapter does not integrate.",
  ads: "Google Ads is a separate product this adapter does not integrate.",
  disclosure: "Nothing is published to a location from here, so there is nothing to disclose. A review reply is a human answer that Make It Social never drafts or sends on its own.",
  // If a publish path is ever added here, flip `disclosure` to "caption" with `formats`.
  webhooks: "Google publishes review notifications through a Pub/Sub topic that must be provisioned per project; this adapter polls instead.",
  quota: "Business Profile API access is granted per Google Cloud project through an application form. An unapproved project has a quota of 0 requests a minute and every call fails.",
  reviewEdits: "A review can be edited or deleted by its author. A changed review keeps its id, so the edit is not re-imported once the original has been ingested.",
};

/** Same for every location: the product exposes exactly one scope and one surface. */
export function capsFor(_cred: Credential): Capabilities {
  return {
    formats: [],
    scheduling: "none",
    disclosure: "none",
    limits: { imagesMax: 0, mentions: false, firstComment: false, links: "none", altText: false },
    inbox: { comments: false, mentions: false, messages: false, reviews: true, reply: true },
    insights: { organic: false, audience: false },
    ads: { import: false, manage: false },
    ingestion: { webhooks: false, polling: true },
    reasons: REASONS,
    checkedAt: now(),
  };
}

/** Google's envelope with a Business Profile fallback message instead of YouTube's. */
export function mapGbpError(status: number, body: GoogleError | string | null, opts: { headers?: Headers; ambiguous?: boolean } = {}) {
  const envelope = typeof body === "string" || body === null ? undefined : body.error;
  const named: GoogleError = { error: { ...envelope, message: envelope?.message || `Google Business Profile API error (${status})` } };
  return mapYouTubeError(status, named, opts);
}

export type GbpInit = { method?: "GET" | "POST" | "PUT" | "DELETE"; body?: unknown; base?: string; query?: Record<string, string | undefined> };

/** One API call. A mutating 5xx or timeout is ambiguous — reconcile before retrying. */
export async function gbp<T>(path: string, token: string, init: GbpInit = {}): Promise<{ body: T; headers: Headers }> {
  const method = init.method ?? "GET";
  const url = new URL(`${init.base ?? REVIEWS}${path}`);
  for (const [k, v] of Object.entries(init.query ?? {})) if (v !== undefined) url.searchParams.set(k, v);
  const res = await httpJson<T & GoogleError>(url.toString(), {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    timeoutMs: method === "GET" ? 20_000 : 30_000,
  });
  if (res.status >= 400) throw mapGbpError(res.status, res.body as GoogleError, { headers: res.headers, ambiguous: method !== "GET" && res.status >= 500 });
  return { body: res.body, headers: res.headers };
}
