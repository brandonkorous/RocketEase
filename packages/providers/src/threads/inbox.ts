/*
 * Threads inbox: replies on the profile's recent posts, read with
 * GET /{media}/conversation (every reply in the thread, flat). A reply is sent
 * the way a post is — a TEXT container with reply_to_id, then publish.
 * Threads puts no client reference on a reply, so an ambiguous send is
 * reconciled structurally over GET /me/replies (ENG-003): ours, same parent,
 * same text, at or after the attempt started.
 */
import type { InboxAuthor, InboxItem, InboxPage, ReplyLookup, ReplyRequest, ReplyResult } from "../inbox-types";
import type { ChannelDescriptor, Credential } from "../types";
import { ProviderError } from "../types";
import { now, threads } from "./client";
import { recentPosts } from "./publish";

export type ThreadsReply = {
  id?: string;
  text?: string;
  username?: string;
  timestamp?: string;
  permalink?: string;
  root_post?: { id?: string };
  replied_to?: { id?: string };
  is_reply?: boolean;
  hide_status?: string;
};
type Post = { id?: string; text?: string; permalink?: string; timestamp?: string };

const REPLY_FIELDS = "id,text,username,timestamp,permalink,root_post,replied_to,is_reply,hide_status";
const handleOf = (username: string | undefined) => (username ? `@${username}` : undefined);

/** The reply object names its author by username only; our own handle marks outbound. */
function authorOf(r: ThreadsReply, ch: ChannelDescriptor): { author: InboxAuthor; mine: boolean } {
  const mine = Boolean(r.username) && handleOf(r.username) === ch.handle;
  if (mine) return { mine, author: { remoteId: ch.remoteId, name: ch.name, handle: ch.handle, avatarUrl: ch.avatarUrl } };
  return { mine, author: { remoteId: r.username ?? "unknown", name: r.username ?? "Threads user", handle: handleOf(r.username), profileUrl: r.username ? `https://www.threads.net/@${r.username}` : undefined } };
}

export function replyToItem(r: ThreadsReply, post: Post, ch: ChannelDescriptor): InboxItem {
  const { author, mine } = authorOf(r, ch);
  return {
    remoteId: r.id ?? "",
    threadRemoteId: r.root_post?.id ?? post.id ?? "",
    kind: "comment",
    direction: mine ? "outbound" : "inbound",
    author,
    text: r.text ?? "",
    occurredAt: r.timestamp ?? now(),
    inReplyToRemoteId: r.replied_to?.id,
    postRemoteId: post.id,
    postUrl: post.permalink,
  };
}

async function conversation(token: string, post: Post, ch: ChannelDescriptor): Promise<InboxItem[]> {
  if (!post.id) return [];
  const res = await threads<{ data?: ThreadsReply[] }>(`/${post.id}/conversation`, token, { params: { fields: REPLY_FIELDS, reverse: "false" } }).catch((e) => {
    if (e instanceof ProviderError && (e.category === "permission" || e.category === "deleted")) return { data: [] as ThreadsReply[] };
    throw e;
  });
  return (res.data ?? []).filter((r) => r.id).map((r) => replyToItem(r, post, ch));
}

/** Replies are time-filtered on `since`; there is no page cursor because the scan is per post. */
export async function fetchInbox(cred: Credential, ch: ChannelDescriptor, opts: { since?: string; cursor?: string }): Promise<InboxPage> {
  const posts = await recentPosts(cred.accessToken, ch.remoteId, undefined, 25);
  const items: InboxItem[] = [];
  for (const post of posts) items.push(...(await conversation(cred.accessToken, post, ch)));
  const fresh = opts.since ? items.filter((i) => i.occurredAt > opts.since!) : items;
  return { items: fresh.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)) };
}

export async function reply(cred: Credential, ch: ChannelDescriptor, req: ReplyRequest): Promise<ReplyResult> {
  if (req.kind !== "comment") throw new ProviderError("Threads has no direct messages; only replies can be sent.", { category: "validation", providerCode: "kind_unsupported" });
  const t = cred.accessToken;
  const target = req.inReplyToRemoteId ?? req.threadRemoteId;
  const container = await threads<{ id?: string }>(`/${ch.remoteId}/threads`, t, { method: "POST", params: { media_type: "TEXT", text: req.text, reply_to_id: target } });
  if (!container.id) throw new ProviderError("Threads returned no container id", { category: "unknown", ambiguous: true });
  const pub = await threads<{ id?: string }>(`/${ch.remoteId}/threads_publish`, t, { method: "POST", params: { creation_id: container.id } });
  if (!pub.id) throw new ProviderError("Threads returned no reply id", { category: "unknown", ambiguous: true });
  return { remoteId: pub.id, sentAt: now() };
}

export async function findReply(cred: Credential, ch: ChannelDescriptor, lookup: ReplyLookup): Promise<ReplyResult | null> {
  const target = lookup.inReplyToRemoteId ?? lookup.threadRemoteId;
  const res = await threads<{ data?: ThreadsReply[] }>(`/${ch.remoteId}/replies`, cred.accessToken, { params: { fields: "id,text,timestamp,replied_to,root_post", limit: "50" } }).catch(() => ({ data: [] as ThreadsReply[] }));
  const hit = (res.data ?? []).find((r) => (r.replied_to?.id === target || r.root_post?.id === target) && r.text === lookup.text && (r.timestamp ?? "") >= lookup.sentAfter);
  return hit?.id ? { remoteId: hit.id, sentAt: hit.timestamp ?? now() } : null;
}
