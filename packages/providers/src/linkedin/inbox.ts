/*
 * LinkedIn inbox (organization Pages only): comments on the Page's recent
 * posts via the Social Actions API and Page mentions via organization
 * notifications. Threading: root comment URN. No DMs exist for third parties.
 */
import type { InboxItem, InboxPage, ReplyRequest, ReplyResult } from "../inbox-types";
import type { ChannelDescriptor, Credential } from "../types";
import { ProviderError } from "../types";
import { li, now, postUrl } from "./client";

export type LiComment = { id?: string; $URN?: string; actor: string; object?: string; parentComment?: string; message?: { text?: string }; created?: { time?: number; actor?: string } };
type Notification = { action: string; generatedActivity?: string; comment?: string; lastModifiedAt?: number; actor?: string };
type PostRow = { id: string; createdAt?: number };

const enc = encodeURIComponent;
const ms = (t: number | undefined) => (t ? new Date(t).toISOString() : now());
const commentUrn = (c: LiComment, post: string) => c.$URN ?? `urn:li:comment:(${post},${c.id ?? ""})`;
const authorOf = (actor: string, ch: ChannelDescriptor) => (actor === ch.remoteId ? { remoteId: ch.remoteId, name: ch.name } : { remoteId: actor, name: actor.includes(":organization:") ? "LinkedIn Page" : "LinkedIn member", profileUrl: undefined });

/** One InboxItem per comment; replies thread under their root comment. */
export function commentToItem(c: LiComment, post: string, ch: ChannelDescriptor, kind: InboxItem["kind"] = "comment"): InboxItem {
  const id = commentUrn(c, post);
  return {
    remoteId: id,
    threadRemoteId: c.parentComment ?? id,
    kind,
    direction: c.actor === ch.remoteId ? "outbound" : "inbound",
    author: authorOf(c.actor, ch),
    text: c.message?.text ?? "",
    occurredAt: ms(c.created?.time),
    inReplyToRemoteId: c.parentComment,
    postRemoteId: post,
    postUrl: postUrl(post),
  };
}

async function recentPosts(token: string, author: string, count = 10): Promise<PostRow[]> {
  const res = await li<{ elements?: PostRow[] }>(`/posts?q=author&author=${enc(author)}&count=${count}&sortBy=LAST_MODIFIED`, token);
  return res.body.elements ?? [];
}

export async function commentsOn(token: string, post: string, count = 50): Promise<LiComment[]> {
  const res = await li<{ elements?: LiComment[] }>(`/socialActions/${enc(post)}/comments?start=0&count=${count}`, token).catch((e) => {
    if (e instanceof ProviderError && e.category === "deleted") return { body: { elements: [] as LiComment[] } };
    throw e;
  });
  return res.body.elements ?? [];
}

async function fetchComments(token: string, ch: ChannelDescriptor, since?: string): Promise<InboxItem[]> {
  const out: InboxItem[] = [];
  for (const p of await recentPosts(token, ch.remoteId)) {
    for (const c of await commentsOn(token, p.id)) {
      const item = commentToItem(c, p.id, ch);
      if (!since || item.occurredAt > since) out.push(item);
    }
  }
  return out;
}

/** Page mentions (SHARE_MENTION / COMMENT_MENTION) from organization notifications. */
async function fetchMentions(token: string, ch: ChannelDescriptor, since?: string): Promise<InboxItem[]> {
  const start = since ? Date.parse(since) : Date.now() - 7 * 86_400_000;
  const path = `/organizationalEntityNotifications?q=criteria&organizationalEntity=${enc(ch.remoteId)}&actions=List(SHARE_MENTION,COMMENT_MENTION)&timeRange=(start:${start},end:${Date.now()})&count=50`;
  const res = await li<{ elements?: Notification[] }>(path, token).catch(() => ({ body: { elements: [] as Notification[] } }));
  return (res.body.elements ?? []).flatMap((n) => {
    if (!n.generatedActivity) return [];
    const id = n.comment ?? `mention:${n.generatedActivity}`;
    return [{ remoteId: id, threadRemoteId: id, kind: "mention" as const, direction: "inbound" as const, author: { remoteId: n.actor ?? "unknown", name: "LinkedIn member" }, text: "", occurredAt: ms(n.lastModifiedAt), postRemoteId: n.generatedActivity, postUrl: postUrl(n.generatedActivity) }];
  });
}

export async function fetchInbox(cred: Credential, ch: ChannelDescriptor, opts: { since?: string }): Promise<InboxPage> {
  const caps = ch.capabilities.inbox;
  const [comments, mentions] = await Promise.all([caps.comments ? fetchComments(cred.accessToken, ch, opts.since) : [], caps.mentions ? fetchMentions(cred.accessToken, ch, opts.since) : []]);
  return { items: [...comments, ...mentions].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)) };
}

/** Comment threads only; the post URN is derived from the root comment URN `urn:li:comment:(post,id)`. */
export async function reply(cred: Credential, ch: ChannelDescriptor, req: ReplyRequest): Promise<ReplyResult> {
  if (req.kind === "message") throw new ProviderError("LinkedIn does not support sending messages from third-party apps.", { category: "permission" });
  const root = req.inReplyToRemoteId ?? req.threadRemoteId;
  const post = /urn:li:comment:\((.+?),/.exec(root)?.[1];
  if (!post) throw new ProviderError("Cannot determine which LinkedIn post this comment belongs to.", { category: "validation" });
  const body = { actor: ch.remoteId, object: post, message: { text: req.text }, parentComment: root };
  const res = await li<LiComment>(`/socialActions/${enc(post)}/comments`, cred.accessToken, { method: "POST", body });
  const id = res.headers.get("x-restli-id") ?? res.body?.$URN;
  if (!id) throw new ProviderError("LinkedIn returned no comment id", { category: "unknown", ambiguous: true });
  return { remoteId: id, sentAt: now() };
}

/** No client reference on comments: find our recent comment carrying the key marker. */
export async function findReply(cred: Credential, ch: ChannelDescriptor, idempotencyKey: string): Promise<ReplyResult | null> {
  const marker = idempotencyKey.slice(0, 8);
  const cutoff = Date.now() - 6 * 3_600_000;
  for (const p of await recentPosts(cred.accessToken, ch.remoteId, 5).catch(() => [] as PostRow[])) {
    for (const c of await commentsOn(cred.accessToken, p.id).catch(() => [] as LiComment[])) {
      const at = c.created?.time ?? 0;
      if (c.actor === ch.remoteId && at > cutoff && (c.message?.text ?? "").includes(marker)) return { remoteId: commentUrn(c, p.id), sentAt: ms(at) };
    }
  }
  return null;
}
