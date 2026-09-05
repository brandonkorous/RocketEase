/*
 * Threads publishing: create a media container, then publish it.
 *   POST /{user}/threads          → { id: containerId }   TEXT | IMAGE | VIDEO | CAROUSEL
 *   POST /{user}/threads_publish  → { id: mediaId }
 * Media containers process asynchronously and are polled, never assumed done.
 * Threads has no idempotency key. An ambiguous publish is reconciled by
 * scanning the profile's recent posts for the attempt's text, never by
 * resending; the attempt is remembered in this process for that scan.
 */
import type { ChannelDescriptor, Credential, MediaInput, PublicationStatus, PublishRequest, PublishResult } from "../types";
import { ProviderError } from "../types";
import { now, postUrl, threads } from "./client";

export type ThreadsSettings = {
  replyControl?: "everyone" | "accounts_you_follow" | "mentioned_only" | "parent_post_author_only" | "followers_only";
  /** One topic per post (1–50 characters, no periods or ampersands). */
  topicTag?: string;
  /** Publish as a reply to this post. */
  replyToId?: string;
};

export type Sleep = (ms: number) => Promise<void>;
type Params = Record<string, string | undefined>;
type Post = { id?: string; text?: string; permalink?: string; timestamp?: string };

const isVideo = (m: MediaInput) => m.mimeType.startsWith("video/");
const defaultSleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Text and reply settings belong to the post itself: the top-level container, never a carousel child. */
export function postParams(req: Omit<PublishRequest, "idempotencyKey">): Params {
  const s = (req.settings ?? {}) as ThreadsSettings;
  return { text: req.text, reply_control: s.replyControl, topic_tag: s.topicTag, reply_to_id: s.replyToId };
}

/** One container. A text post may carry a link card; media posts carry alt text. */
export function containerParams(req: Omit<PublishRequest, "idempotencyKey">, media?: MediaInput, child = false): Params {
  const base = child ? { is_carousel_item: "true" } : postParams(req);
  if (!media) return { ...base, media_type: "TEXT", link_attachment: req.link };
  if (isVideo(media)) return { ...base, media_type: "VIDEO", video_url: media.url, alt_text: media.altText };
  return { ...base, media_type: "IMAGE", image_url: media.url, alt_text: media.altText };
}

async function create(token: string, userId: string, params: Params): Promise<string> {
  const res = await threads<{ id?: string }>(`/${userId}/threads`, token, { method: "POST", params });
  if (!res.id) throw new ProviderError("Threads returned no container id", { category: "unknown", ambiguous: true });
  return res.id;
}

/** Poll the container until Threads reports it FINISHED (about five minutes at most). */
export async function waitForContainer(token: string, containerId: string, sleep: Sleep = defaultSleep) {
  for (let i = 0; i < 30; i++) {
    const s = await threads<{ status?: string; error_message?: string }>(`/${containerId}`, token, { params: { fields: "status,error_message" } });
    if (s.status === "FINISHED" || s.status === "PUBLISHED") return;
    if (s.status === "ERROR" || s.status === "EXPIRED") throw new ProviderError(`Threads could not process the media (${s.error_message ?? s.status})`, { category: "validation" });
    await sleep(10_000);
  }
  throw new ProviderError("Threads media processing timed out", { category: "temporary", ambiguous: true });
}

async function buildContainer(token: string, userId: string, req: PublishRequest, sleep: Sleep): Promise<string> {
  if (req.format === "carousel") {
    const children: string[] = [];
    for (const m of req.media) children.push(await create(token, userId, containerParams(req, m, true)));
    for (const [i, id] of children.entries()) if (isVideo(req.media[i])) await waitForContainer(token, id, sleep);
    return create(token, userId, { ...postParams(req), media_type: "CAROUSEL", children: children.join(",") });
  }
  const media = req.media[0];
  const id = await create(token, userId, containerParams(req, media));
  if (media && isVideo(media)) await waitForContainer(token, id, sleep);
  return id;
}

/** Attempts this process started, so an ambiguous failure can be matched by text and time. */
const attempts = new Map<string, { text: string; startedAt: string }>();
const ATTEMPT_TTL_MS = 6 * 3_600_000;

function remember(key: string, text: string) {
  const cutoff = Date.now() - ATTEMPT_TTL_MS;
  for (const [k, v] of attempts) if (Date.parse(v.startedAt) < cutoff) attempts.delete(k);
  attempts.set(key, { text, startedAt: now() });
}

export async function publish(cred: Credential, ch: ChannelDescriptor, req: PublishRequest, sleep: Sleep = defaultSleep): Promise<PublishResult> {
  const t = cred.accessToken;
  remember(req.idempotencyKey, req.text);
  const containerId = await buildContainer(t, ch.remoteId, req, sleep);
  const pub = await threads<{ id?: string }>(`/${ch.remoteId}/threads_publish`, t, { method: "POST", params: { creation_id: containerId } });
  if (!pub.id) throw new ProviderError("Threads returned no post id", { category: "unknown", ambiguous: true });
  const post = await threads<Post>(`/${pub.id}`, t, { params: { fields: "id,permalink,timestamp" } }).catch(() => ({}) as Post);
  return { remoteId: pub.id, url: postUrl(post.permalink, ch.handle, pub.id), publishedAt: post.timestamp ?? now() };
}

export async function recentPosts(token: string, userId: string, sinceIso?: string, limit = 25): Promise<Post[]> {
  const since = sinceIso ? String(Math.floor(Date.parse(sinceIso) / 1000)) : undefined;
  const res = await threads<{ data?: Post[] }>(`/${userId}/threads`, token, { params: { fields: "id,text,permalink,timestamp", limit: String(limit), since } });
  return res.data ?? [];
}

/** Only an attempt this process remembers can be matched; anything else is honestly unknown. */
export async function findPublication(cred: Credential, ch: ChannelDescriptor, idempotencyKey: string): Promise<PublishResult | null> {
  const attempt = attempts.get(idempotencyKey);
  if (!attempt) return null;
  const posts = await recentPosts(cred.accessToken, ch.remoteId, attempt.startedAt).catch(() => [] as Post[]);
  const hit = posts.find((p) => (p.text ?? "") === attempt.text && (!p.timestamp || p.timestamp >= attempt.startedAt));
  return hit?.id ? { remoteId: hit.id, url: postUrl(hit.permalink, ch.handle, hit.id), publishedAt: hit.timestamp ?? now() } : null;
}

export async function publicationStatus(cred: Credential, ch: ChannelDescriptor, remoteId: string): Promise<PublicationStatus> {
  try {
    const r = await threads<Post>(`/${remoteId}`, cred.accessToken, { params: { fields: "id,permalink" } });
    return r.id ? { state: "published", url: postUrl(r.permalink, ch.handle, remoteId) } : { state: "deleted" };
  } catch (e) {
    return e instanceof ProviderError && e.category === "deleted" ? { state: "deleted" } : { state: "unknown" };
  }
}
