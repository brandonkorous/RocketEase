/*
 * X inbox: mentions (GET /2/users/:id/mentions) and, when the account granted
 * dm.read, direct messages (GET /2/dm_events). Threading uses X's own
 * `conversation_id` for posts and `dm_conversation_id` for DMs.
 *
 * A mention that replies to one of our posts is a "comment"; a standalone
 * mention is a "mention" — X has no separate comments API, replies ARE posts.
 * The page cursor is the mentions `newest_id`, replayed as `since_id`.
 */
import type { InboxAuthor, InboxItem, InboxPage, ReplyLookup, ReplyRequest, ReplyResult } from "../inbox-types";
import type { ChannelDescriptor, Credential } from "../types";
import { ProviderError } from "../types";
import { now, postUrl, x } from "./client";

type XUser = { id?: string; name?: string; username?: string; profile_image_url?: string };
type Ref = { type?: string; id?: string };
export type XTweet = { id?: string; text?: string; created_at?: string; author_id?: string; conversation_id?: string; referenced_tweets?: Ref[] };
export type XDmEvent = { id?: string; event_type?: string; text?: string; created_at?: string; sender_id?: string; dm_conversation_id?: string };
type Includes = { users?: XUser[] };

const MENTION_FIELDS = "tweet.fields=created_at,conversation_id,referenced_tweets,author_id&expansions=author_id&user.fields=name,username,profile_image_url&max_results=100";
const DM_FIELDS = "dm_event.fields=id,text,created_at,sender_id,dm_conversation_id,event_type&expansions=sender_id&user.fields=name,username,profile_image_url&max_results=100";

function authorOf(id: string | undefined, includes: Includes, ch: ChannelDescriptor): InboxAuthor {
  if (id && id === ch.remoteId) return { remoteId: ch.remoteId, name: ch.name, handle: ch.handle, avatarUrl: ch.avatarUrl };
  const u = includes.users?.find((candidate) => candidate.id === id);
  return { remoteId: id ?? "unknown", name: u?.name ?? u?.username ?? "X user", handle: u?.username ? `@${u.username}` : undefined, avatarUrl: u?.profile_image_url, profileUrl: u?.username ? `https://x.com/${u.username}` : undefined };
}

export function tweetToItem(t: XTweet, includes: Includes, ch: ChannelDescriptor): InboxItem {
  const repliedTo = t.referenced_tweets?.find((r) => r.type === "replied_to")?.id;
  const thread = t.conversation_id ?? t.id ?? "";
  return {
    remoteId: t.id ?? thread,
    threadRemoteId: thread,
    kind: repliedTo ? "comment" : "mention",
    direction: t.author_id === ch.remoteId ? "outbound" : "inbound",
    author: authorOf(t.author_id, includes, ch),
    text: t.text ?? "",
    occurredAt: t.created_at ?? now(),
    inReplyToRemoteId: repliedTo,
    postRemoteId: repliedTo ?? thread,
    postUrl: t.id ? postUrl(undefined, t.id) : undefined,
  };
}

export function dmToItem(e: XDmEvent, includes: Includes, ch: ChannelDescriptor): InboxItem | null {
  if (e.event_type && e.event_type !== "MessageCreate") return null;
  const thread = e.dm_conversation_id ?? e.id ?? "";
  return {
    remoteId: e.id ?? thread,
    threadRemoteId: thread,
    kind: "message",
    direction: e.sender_id === ch.remoteId ? "outbound" : "inbound",
    author: authorOf(e.sender_id, includes, ch),
    text: e.text ?? "",
    occurredAt: e.created_at ?? now(),
  };
}

async function mentions(token: string, ch: ChannelDescriptor, cursor?: string): Promise<{ items: InboxItem[]; cursor?: string }> {
  const since = cursor ? `&since_id=${encodeURIComponent(cursor)}` : "";
  const res = await x<{ data?: XTweet[]; includes?: Includes; meta?: { newest_id?: string } }>(`/users/${encodeURIComponent(ch.remoteId)}/mentions?${MENTION_FIELDS}${since}`, token);
  const includes = res.body.includes ?? {};
  return { items: (res.body.data ?? []).map((t) => tweetToItem(t, includes, ch)), cursor: res.body.meta?.newest_id ?? cursor };
}

/** dm_events has no since_id, so new messages are filtered on created_at. */
async function directMessages(token: string, ch: ChannelDescriptor, since?: string): Promise<InboxItem[]> {
  type DmPage = { data?: XDmEvent[]; includes?: Includes };
  const res = await x<DmPage>(`/dm_events?${DM_FIELDS}`, token).catch((e) => {
    if (e instanceof ProviderError && e.category === "permission") return { body: {} as DmPage };
    throw e;
  });
  const includes = res.body.includes ?? {};
  return (res.body.data ?? []).flatMap((e) => {
    const item = dmToItem(e, includes, ch);
    return item && (!since || item.occurredAt > since) ? [item] : [];
  });
}

export async function fetchInbox(cred: Credential, ch: ChannelDescriptor, opts: { since?: string; cursor?: string }): Promise<InboxPage> {
  const page = await mentions(cred.accessToken, ch, opts.cursor);
  const fresh = opts.since ? page.items.filter((i) => i.occurredAt > opts.since!) : page.items;
  const dms = ch.capabilities.inbox.messages ? await directMessages(cred.accessToken, ch, opts.since) : [];
  return { items: [...fresh, ...dms].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)), cursor: page.cursor };
}

/** A reply to a mention is a post; a reply to a DM is a message in that conversation. */
export async function reply(cred: Credential, ch: ChannelDescriptor, req: ReplyRequest): Promise<ReplyResult> {
  if (req.kind === "message") return replyDm(cred, ch, req);
  const inReplyTo = req.inReplyToRemoteId ?? req.postRemoteId ?? req.threadRemoteId;
  const res = await x<{ data?: XTweet }>("/tweets", cred.accessToken, { method: "POST", body: { text: req.text, reply: { in_reply_to_tweet_id: inReplyTo } } });
  const id = res.body.data?.id;
  if (!id) throw new ProviderError("X returned no post id", { category: "unknown", ambiguous: true });
  return { remoteId: id, sentAt: res.body.data?.created_at ?? now() };
}

async function replyDm(cred: Credential, ch: ChannelDescriptor, req: ReplyRequest): Promise<ReplyResult> {
  if (!ch.capabilities.inbox.messages) throw new ProviderError("This X account did not grant direct message access (dm.read / dm.write).", { category: "permission", providerCode: "dm_scope_missing" });
  const path = req.threadRemoteId ? `/dm_conversations/${encodeURIComponent(req.threadRemoteId)}/messages` : `/dm_conversations/with/${encodeURIComponent(req.recipientRemoteId ?? "")}/messages`;
  const res = await x<{ data?: { dm_event_id?: string } }>(path, cred.accessToken, { method: "POST", body: { text: req.text } });
  const id = res.body.data?.dm_event_id;
  if (!id) throw new ProviderError("X returned no message id", { category: "unknown", ambiguous: true });
  return { remoteId: id, sentAt: now() };
}

/**
 * X has no client reference on posts or DMs, so an ambiguous reply is
 * reconciled structurally (ENG-003): sent by us, in the same thread, same
 * text, at or after the attempt started.
 */
export async function findReply(cred: Credential, ch: ChannelDescriptor, lookup: ReplyLookup): Promise<ReplyResult | null> {
  const items = lookup.kind === "message" ? await directMessages(cred.accessToken, ch).catch(() => []) : await ownPosts(cred.accessToken, ch).catch(() => []);
  const hit = items.find((i) => i.direction === "outbound" && i.threadRemoteId === lookup.threadRemoteId && i.text === lookup.text && i.occurredAt >= lookup.sentAfter);
  return hit ? { remoteId: hit.remoteId, sentAt: hit.occurredAt } : null;
}

async function ownPosts(token: string, ch: ChannelDescriptor): Promise<InboxItem[]> {
  const res = await x<{ data?: XTweet[]; includes?: Includes }>(`/users/${encodeURIComponent(ch.remoteId)}/tweets?${MENTION_FIELDS.replace("max_results=100", "max_results=50")}`, token);
  return (res.body.data ?? []).map((t) => tweetToItem({ ...t, author_id: t.author_id ?? ch.remoteId }, res.body.includes ?? {}, ch));
}
