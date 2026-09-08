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
import { hideWhy } from "../moderation";
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

/** Post limits (M14.8), each with where it came from — see the reasons below for the words shown. */
export const LIMITS = {
  /** Google's post editor refuses text over this ("Enter details no longer than 1500 characters"); the API reference publishes no number. */
  summaryChars: 1500,
  /** The localPosts reference does not say how many photos a post takes; one is sent until Google documents more. */
  photos: 1,
  /** Business Profile photo guideline (support.google.com/business/answer/6103862): JPG or PNG, 10 KB to 5 MB, at least 250 px a side. */
  photoMaxBytes: 5 * 1024 * 1024,
};

const REASONS: Record<string, string> = {
  scheduling: "Google's posts API has no schedule field; RocketEase holds the post and sends it at the scheduled time.",
  textMaxChars: "Google's post editor refuses text over 1,500 characters; the API reference publishes no number, so that one is used.",
  imagesMax: "Google's localPosts reference does not say how many photos a post takes; RocketEase sends the first photo until it does.",
  video: "Google's local post media is documented with photos only; video stays off until Google documents it.",
  comments: "Google Business Profile has no comments; the only public conversation on a location is a review.",
  mentions: "Google Business Profile has no mentions feed.",
  messages: "Business Messages (the chat product) was shut down by Google and has no replacement API.",
  firstComment: "A Business Profile post has no comments, so there is no first comment.",
  links: "A post carries one button (Learn more, Book, Order online, Buy, Sign up, Call now) with its link; the post text itself is plain.",
  altText: "Google's local post media takes a source URL only; there is no alt text field.",
  insights: "Location performance lives in the separate Business Profile Performance API, which this adapter does not integrate.",
  ads: "Google Ads is a separate product this adapter does not integrate.",
  disclosure: "Local posts have no AI-content field; the label goes in the post text.",
  lifetime: "Google archives posts older than 6 months unless the post has a date range (an event or an offer).",
  webhooks: "Google publishes review notifications through a Pub/Sub topic that must be provisioned per project; this adapter polls instead.",
  quota: "Business Profile API access is granted per Google Cloud project through an application form. An unapproved project has a quota of 0 requests a minute and every call fails.",
  hide: hideWhy("google_business")!,
  reviewEdits: "A review can be edited or deleted by its author. A changed review keeps its id, so the edit is not re-imported once the original has been ingested.",
};

/** Same for every location: the product exposes exactly one scope, and every location takes the same posts. */
export function capsFor(_cred: Credential): Capabilities {
  return {
    formats: ["text", "image"],
    scheduling: "internal",
    disclosure: "caption",
    limits: { textMaxChars: LIMITS.summaryChars, imagesMax: LIMITS.photos, imageMaxBytes: LIMITS.photoMaxBytes, mentions: false, firstComment: false, links: "attached", altText: false },
    inbox: { comments: false, mentions: false, messages: false, reviews: true, reply: true, hide: false },
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
