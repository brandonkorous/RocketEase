/*
 * TikTok comments via the Business Account API (comment.list /
 * comment.list.manage scopes). Threading: root comment id. TikTok exposes no
 * DMs or mentions to third-party apps, so those kinds never appear here.
 */
import type { InboxItem, InboxPage, ReplyRequest, ReplyResult } from "../inbox-types";
import type { ChannelDescriptor, Credential } from "../types";
import { ProviderError } from "../types";
import { biz, now, tt } from "./client";

export type BizComment = { comment_id: string; video_id?: string; text?: string; create_time?: number; user_id?: string; username?: string; display_name?: string; profile_image?: string; owner?: boolean; parent_comment_id?: string; replies?: number };
type Video = { id: string; share_url?: string; create_time?: number };

const at = (t: number | undefined) => (t ? new Date(t * 1000).toISOString() : now());

export function commentToItem(c: BizComment, ch: ChannelDescriptor, video: Video, root?: string): InboxItem {
  const parent = c.parent_comment_id ?? root;
  const mine = c.owner === true || c.user_id === ch.remoteId;
  return {
    remoteId: c.comment_id,
    threadRemoteId: parent ?? c.comment_id,
    kind: "comment",
    direction: mine ? "outbound" : "inbound",
    author: mine ? { remoteId: ch.remoteId, name: ch.name } : { remoteId: c.user_id ?? c.username ?? c.comment_id, name: c.display_name ?? c.username ?? "TikTok user", handle: c.username ? `@${c.username}` : undefined, avatarUrl: c.profile_image },
    text: c.text ?? "",
    occurredAt: at(c.create_time),
    inReplyToRemoteId: parent,
    postRemoteId: video.id,
    postUrl: video.share_url,
  };
}

async function recentVideos(token: string): Promise<Video[]> {
  const r = await tt<{ data?: { videos?: Video[] } }>("/video/list/?fields=id,share_url,create_time", token, { max_count: 10 });
  return r.data?.videos ?? [];
}

async function commentsFor(token: string, businessId: string, video: Video, ch: ChannelDescriptor, since?: string): Promise<InboxItem[]> {
  const page = await biz<{ comments?: BizComment[] }>("/business/comment/list/", token, { query: { business_id: businessId, video_id: video.id, max_count: "30", sort_field: "create_time", sort_order: "DESC" } });
  const out: InboxItem[] = [];
  for (const c of page.comments ?? []) {
    const item = commentToItem(c, ch, video);
    if (since && item.occurredAt <= since) continue;
    out.push(item);
    if (!c.replies) continue;
    const replies = await biz<{ comments?: BizComment[] }>("/business/comment/reply/list/", token, { query: { business_id: businessId, video_id: video.id, comment_id: c.comment_id, max_count: "30" } }).catch(() => ({ comments: [] as BizComment[] }));
    for (const r of replies.comments ?? []) {
      const ri = commentToItem(r, ch, video, c.comment_id);
      if (!since || ri.occurredAt > since) out.push(ri);
    }
  }
  return out;
}

export async function fetchInbox(cred: Credential, ch: ChannelDescriptor, opts: { since?: string }): Promise<InboxPage> {
  if (!ch.capabilities.inbox.comments) return { items: [] };
  const out: InboxItem[] = [];
  for (const v of await recentVideos(cred.accessToken)) out.push(...(await commentsFor(cred.accessToken, ch.remoteId, v, ch, opts.since)));
  return { items: out.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)) };
}

/** The reply endpoint is video-scoped; when the caller has no post id, locate the root comment on recent videos. */
async function videoOfComment(token: string, businessId: string, commentId: string): Promise<string | undefined> {
  for (const v of await recentVideos(token)) {
    const page = await biz<{ comments?: BizComment[] }>("/business/comment/list/", token, { query: { business_id: businessId, video_id: v.id, max_count: "30", sort_field: "create_time", sort_order: "DESC" } }).catch(() => ({ comments: [] as BizComment[] }));
    if ((page.comments ?? []).some((c) => c.comment_id === commentId)) return v.id;
  }
  return undefined;
}

/** Reply to a comment. TikTok replies attach to the root comment of the thread. */
export async function reply(cred: Credential, ch: ChannelDescriptor, req: ReplyRequest): Promise<ReplyResult> {
  if (req.kind !== "comment") throw new ProviderError("TikTok only supports replying to comments.", { category: "permission" });
  if (!ch.capabilities.inbox.reply) throw new ProviderError("This TikTok account did not grant comment management.", { category: "permission", providerCode: "scope_not_authorized" });
  const videoId = req.postRemoteId ?? (await videoOfComment(cred.accessToken, ch.remoteId, req.threadRemoteId));
  if (!videoId) throw new ProviderError("Could not find the TikTok video this comment belongs to.", { category: "deleted" });
  const r = await biz<{ comment_id?: string }>("/business/comment/reply/create/", cred.accessToken, { body: { business_id: ch.remoteId, video_id: videoId, comment_id: req.inReplyToRemoteId ?? req.threadRemoteId, text: req.text } });
  if (!r.comment_id) throw new ProviderError("TikTok returned no comment id", { category: "unknown", ambiguous: true });
  return { remoteId: r.comment_id, sentAt: now() };
}

/** Scan our own recent replies for the key marker (TikTok has no client reference on comments). */
export async function findReply(cred: Credential, ch: ChannelDescriptor, idempotencyKey: string): Promise<ReplyResult | null> {
  const marker = idempotencyKey.slice(0, 8);
  const cutoff = new Date(Date.now() - 6 * 3_600_000).toISOString();
  for (const v of await recentVideos(cred.accessToken).catch(() => [] as Video[])) {
    const items = await commentsFor(cred.accessToken, ch.remoteId, v, ch, cutoff).catch(() => [] as InboxItem[]);
    const hit = items.find((i) => i.direction === "outbound" && i.text.includes(marker));
    if (hit) return { remoteId: hit.remoteId, sentAt: hit.occurredAt };
  }
  return null;
}
