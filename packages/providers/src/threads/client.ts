/*
 * Threads API client (graph.threads.net, v1.0). Threads is a SEPARATE app id
 * from the Meta app, with its own consent host (threads.net) and its own token
 * exchange, but the error envelope is the Graph one, so mapGraphError is reused.
 * Every limit below is from developers.facebook.com/docs/threads, read 2026-09-05.
 */
import type { Capabilities, Credential } from "../types";
import { form, httpJson } from "../http";
import { mapGraphError, type GraphError } from "../meta/graph";

export const API = "https://graph.threads.net/v1.0";
export const TOKEN_HOST = "https://graph.threads.net";
export const OAUTH_AUTH = "https://threads.net/oauth/authorize";
export const now = () => new Date().toISOString();

export const SCOPES = {
  base: ["threads_basic"],
  publish: ["threads_content_publish"],
  readReplies: ["threads_read_replies"],
  manageReplies: ["threads_manage_replies"],
  insights: ["threads_manage_insights"],
};

export const LIMITS = {
  /** "Text posts are limited to 500 characters"; emoji count as their UTF-8 bytes. */
  text: 500,
  carouselMin: 2,
  carouselMax: 20,
  imageBytes: 8 * 1024 * 1024,
  videoBytes: 1024 * 1024 * 1024,
  videoSeconds: 300,
  /** "250 API-published posts within a 24-hour moving period." */
  postsPer24h: 250,
  /** "1,000 replies within a 24-hour moving period." */
  repliesPer24h: 1000,
  topicTag: 50,
  /** The docs recommend waiting before publishing a media container. */
  containerWaitMs: 30_000,
};

export function capsFor(cred: Credential): Capabilities {
  const has = (list: string[]) => list.every((s) => cred.scopes.includes(s));
  const reasons: Record<string, string> = {
    firstComment: "A follow-up is published as a reply to the post rather than a separate first-comment field.",
    mentions: "Threads delivers mentions only through webhooks that need Advanced Access and a verified business; that subscription is not wired yet.",
    messages: "Threads has no direct-message API.",
    reviews: "Threads has no reviews.",
    ads: "Threads ads are bought in Meta Ads Manager; the Threads API has no ads surface.",
    webhooks: "Threads webhooks need the app in Live Mode with Advanced Access and a verified business; replies are polled until then.",
    disclosure: "The Threads API has no AI-content field; the label goes in the post text.",
    cover: "The Threads API has no cover or thumbnail field for video; Threads picks its own frame.",
    hashtags: "Threads shows one topic tag per post (topic_tag); other # words are plain text.",
    quota: "Threads accepts 250 API-published posts and 1,000 replies per profile in a 24-hour moving window.",
  };
  if (!has(SCOPES.publish)) reasons.formats = "Publishing needs the threads_content_publish permission, which this login did not grant.";
  if (!has(SCOPES.readReplies)) reasons.comments = "Reading replies needs the threads_read_replies permission.";
  if (!has(SCOPES.manageReplies)) reasons.reply = "Replying needs the threads_manage_replies permission.";
  if (!has(SCOPES.insights)) reasons.insights = "Insights need the threads_manage_insights permission.";
  else reasons.audience = "Follower demographics need at least 100 followers; smaller profiles get the follower count only.";
  return {
    formats: has(SCOPES.publish) ? ["text", "image", "carousel", "video"] : [],
    scheduling: "internal",
    limits: {
      textMaxChars: LIMITS.text,
      imagesMax: LIMITS.carouselMax,
      videoMaxSeconds: LIMITS.videoSeconds,
      videoMaxBytes: LIMITS.videoBytes,
      imageMaxBytes: LIMITS.imageBytes,
      mentions: true,
      firstComment: false,
      links: "inline",
      altText: true,
    },
    inbox: { comments: has(SCOPES.readReplies), mentions: false, messages: false, reviews: false, reply: has(SCOPES.manageReplies) },
    insights: { organic: has(SCOPES.insights), audience: has(SCOPES.insights) },
    ads: { import: false, manage: false },
    ingestion: { webhooks: false, polling: true },
    disclosure: "caption",
    cover: "none",
    reasons,
    checkedAt: now(),
  };
}

export type ThreadsInit = { method?: "GET" | "POST"; params?: Record<string, string | undefined> };

/** Graph-style call: GET carries params in the query, POST as a form body. Mutating 5xx is ambiguous. */
export async function threads<T>(path: string, token: string, init: ThreadsInit = {}): Promise<T> {
  const method = init.method ?? "GET";
  const params = { ...(init.params ?? {}), access_token: token };
  const url = method === "GET" ? `${API}${path}?${form(params)}` : `${API}${path}`;
  const res = await httpJson<T & GraphError>(url, {
    method,
    headers: method === "GET" ? undefined : { "Content-Type": "application/x-www-form-urlencoded" },
    body: method === "GET" ? undefined : form(params),
    timeoutMs: method === "GET" ? 20_000 : 60_000,
  });
  if (res.status >= 400 || (res.body as GraphError)?.error) throw mapGraphError(res.status, res.body as GraphError, method !== "GET" && res.status >= 500);
  return res.body;
}

/** Token calls live on the bare host, without the version segment. */
export async function tokenCall<T>(path: string, params: Record<string, string | undefined>, method: "GET" | "POST" = "GET"): Promise<T> {
  const url = method === "GET" ? `${TOKEN_HOST}${path}?${form(params)}` : `${TOKEN_HOST}${path}`;
  const res = await httpJson<T & GraphError & { access_token?: string }>(url, {
    method,
    headers: method === "GET" ? undefined : { "Content-Type": "application/x-www-form-urlencoded" },
    body: method === "GET" ? undefined : form(params),
  });
  if (res.status >= 400 || (res.body as GraphError)?.error || !res.body.access_token) throw mapGraphError(res.status === 200 ? 401 : res.status, res.body as GraphError);
  return res.body;
}

export const expiry = (seconds: number | undefined, fallback?: string) => (seconds ? new Date(Date.now() + seconds * 1000).toISOString() : fallback);
export const postUrl = (permalink: string | undefined, handle: string | undefined, id: string) => permalink ?? (handle ? `https://www.threads.net/@${handle.replace(/^@/, "")}/post/${id}` : undefined);
