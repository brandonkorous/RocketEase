/*
 * X publishing: POST /2/tweets, with media uploaded through the v1.1 chunked
 * endpoint first (media.ts). A thread is N posts, each replying to the one
 * before; the FIRST post is the canonical remote id for the content item.
 *
 * X has no idempotency key on /2/tweets, so an ambiguous failure is reconciled
 * with findPublication before any retry — never by resending blind.
 */
import type { ChannelDescriptor, Credential, PublicationStatus, PublishRequest, PublishResult } from "../types";
import { ProviderError } from "../types";
import { now, postUrl, x } from "./client";
import { uploadMedia } from "./media";

type Settings = { thread?: string[]; replySettings?: "everyone" | "mentionedUsers" | "following"; inReplyToTweetId?: string; quoteTweetId?: string; forSuperFollowersOnly?: boolean };
type TweetRow = { id?: string; text?: string; created_at?: string };

export function tweetBody(text: string, mediaIds: string[], s: Settings, replyTo?: string) {
  const inReplyTo = replyTo ?? s.inReplyToTweetId;
  return {
    text,
    ...(mediaIds.length ? { media: { media_ids: mediaIds } } : {}),
    ...(inReplyTo ? { reply: { in_reply_to_tweet_id: inReplyTo } } : {}),
    ...(s.quoteTweetId ? { quote_tweet_id: s.quoteTweetId } : {}),
    ...(s.replySettings ? { reply_settings: s.replySettings } : {}),
    ...(s.forSuperFollowersOnly ? { for_super_followers_only: true } : {}),
  };
}

async function post(token: string, body: Record<string, unknown>): Promise<TweetRow> {
  const res = await x<{ data?: TweetRow }>("/tweets", token, { method: "POST", body });
  const row = res.body.data;
  if (!row?.id) throw new ProviderError("X returned no post id", { category: "unknown", ambiguous: true });
  return row;
}

export async function publish(cred: Credential, channel: ChannelDescriptor, req: PublishRequest): Promise<PublishResult> {
  const s = (req.settings ?? {}) as Settings;
  const mediaIds: string[] = [];
  for (const m of req.media) mediaIds.push(await uploadMedia(cred.accessToken, m));
  const root = await post(cred.accessToken, tweetBody(req.text, mediaIds, s));
  // Thread continuation: a failure here leaves the root published, so it is
  // reported as ambiguous rather than retried from the top.
  let previous = root.id!;
  for (const part of s.thread ?? []) {
    const next = await post(cred.accessToken, tweetBody(part, [], s, previous)).catch((e) => {
      throw new ProviderError(`The first post published but the thread stopped: ${e instanceof Error ? e.message : "unknown error"}`, { category: "temporary", ambiguous: true, cause: e });
    });
    previous = next.id!;
  }
  return { remoteId: root.id!, url: postUrl(channel.handle, root.id!), publishedAt: root.created_at ?? now() };
}

/** X carries no client reference on a post: scan our recent posts for the key marker. */
export async function findPublication(cred: Credential, channel: ChannelDescriptor, idempotencyKey: string): Promise<PublishResult | null> {
  const marker = idempotencyKey.slice(0, 8);
  const res = await x<{ data?: TweetRow[] }>(`/users/${encodeURIComponent(channel.remoteId)}/tweets?max_results=20&tweet.fields=created_at`, cred.accessToken).catch(() => ({ body: { data: [] as TweetRow[] } }));
  const hit = (res.body.data ?? []).find((t) => (t.text ?? "").includes(marker));
  return hit?.id ? { remoteId: hit.id, url: postUrl(channel.handle, hit.id), publishedAt: hit.created_at ?? now() } : null;
}

export async function publicationStatus(cred: Credential, channel: ChannelDescriptor, remoteId: string): Promise<PublicationStatus> {
  try {
    const res = await x<{ data?: TweetRow }>(`/tweets/${encodeURIComponent(remoteId)}?tweet.fields=created_at`, cred.accessToken);
    return res.body.data?.id ? { state: "published", url: postUrl(channel.handle, remoteId) } : { state: "deleted" };
  } catch (e) {
    return e instanceof ProviderError && e.category === "deleted" ? { state: "deleted" } : { state: "unknown" };
  }
}
