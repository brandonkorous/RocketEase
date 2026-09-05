/*
 * Bluesky inbox: app.bsky.notification.listNotifications, keeping only the
 * reasons that are conversation — `reply` (a comment on our post), `mention`
 * and `quote` (mentions). Likes, reposts and follows are not inbox items. A
 * reply is a post record with root/parent strong refs, so the parent post is
 * read first for its cid. Our replies take a record key derived from the
 * idempotency key, so reconciliation is a record lookup (ENG-003).
 */
import type { InboxItem, InboxPage, ReplyLookup, ReplyRequest, ReplyResult } from "../inbox-types";
import type { ChannelDescriptor, Credential } from "../types";
import { ProviderError } from "../types";
import { POST_COLLECTION, now, postUrl, tidFromKey, xrpc } from "./client";
import { createRecord, ctxFor, getRecord, resolver, type PostRecord, type StrongRef } from "./publish";
import { facetsFor } from "./richtext";

export type Notification = {
  uri?: string;
  cid?: string;
  author?: { did?: string; handle?: string; displayName?: string; avatar?: string };
  reason?: string;
  reasonSubject?: string;
  record?: { text?: string; createdAt?: string; reply?: { root?: StrongRef; parent?: StrongRef } };
  isRead?: boolean;
  indexedAt?: string;
};
type PostView = { uri?: string; cid?: string; record?: { reply?: { root?: StrongRef; parent?: StrongRef } } };

const REASONS = ["reply", "mention", "quote"];

export function notificationToItem(n: Notification, ch: ChannelDescriptor): InboxItem | null {
  if (!n.uri || !n.reason || !REASONS.includes(n.reason)) return null;
  const did = n.author?.did ?? "unknown";
  const handle = n.author?.handle;
  const reply = n.record?.reply;
  return {
    remoteId: n.uri,
    threadRemoteId: reply?.root?.uri ?? n.uri,
    kind: n.reason === "reply" ? "comment" : "mention",
    direction: did === ch.remoteId ? "outbound" : "inbound",
    author: { remoteId: did, name: n.author?.displayName || handle || "Bluesky user", handle: handle ? `@${handle}` : undefined, avatarUrl: n.author?.avatar, profileUrl: handle ? `https://bsky.app/profile/${handle}` : undefined },
    text: n.record?.text ?? "",
    occurredAt: n.indexedAt ?? n.record?.createdAt ?? now(),
    inReplyToRemoteId: reply?.parent?.uri,
    postRemoteId: n.reasonSubject ?? reply?.root?.uri,
    postUrl: postUrl(handle, did, n.uri),
  };
}

/** Pages run backwards in time; the cursor is returned only while the page is still newer than `since`. */
export async function fetchInbox(service: string, cred: Credential, ch: ChannelDescriptor, opts: { since?: string; cursor?: string }): Promise<InboxPage> {
  const res = await xrpc<{ notifications?: Notification[]; cursor?: string }>("app.bsky.notification.listNotifications", { base: service, token: cred.accessToken, params: { limit: "100", cursor: opts.cursor, reasons: REASONS } });
  const all = (res.body.notifications ?? []).map((n) => notificationToItem(n, ch)).filter((i): i is InboxItem => i !== null);
  const items = opts.since ? all.filter((i) => i.occurredAt > opts.since!) : all;
  const more = res.body.cursor && (!opts.since || items.length === all.length);
  return { items: items.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)), cursor: more ? res.body.cursor : undefined };
}

async function postView(service: string, token: string, uri: string): Promise<PostView> {
  const res = await xrpc<{ posts?: PostView[] }>("app.bsky.feed.getPosts", { base: service, token, params: { uris: [uri] } });
  const post = res.body.posts?.[0];
  if (!post?.uri || !post.cid) throw new ProviderError("The post being replied to is no longer on Bluesky.", { category: "deleted" });
  return post;
}

export async function reply(service: string, cred: Credential, ch: ChannelDescriptor, req: ReplyRequest): Promise<ReplyResult> {
  if (req.kind === "message" || req.kind === "review") throw new ProviderError("Bluesky replies are posts; direct messages are not wired.", { category: "validation", providerCode: "kind_unsupported" });
  const parentUri = req.inReplyToRemoteId ?? req.threadRemoteId;
  const parent = await postView(service, cred.accessToken, parentUri);
  const parentRef: StrongRef = { uri: parent.uri!, cid: parent.cid! };
  const root = parent.record?.reply?.root ?? parentRef;
  const record: PostRecord = { $type: POST_COLLECTION, text: req.text, createdAt: now(), reply: { root, parent: parentRef } };
  const facets = await facetsFor(req.text, resolver(service));
  if (facets.length) record.facets = facets;
  const ref = await createRecord(ctxFor(service, cred, ch), tidFromKey(req.idempotencyKey), record);
  return { remoteId: ref.uri, sentAt: record.createdAt };
}

export async function findReply(service: string, cred: Credential, ch: ChannelDescriptor, lookup: ReplyLookup): Promise<ReplyResult | null> {
  const hit = await getRecord(ctxFor(service, cred, ch), tidFromKey(lookup.idempotencyKey)).catch(() => null);
  return hit ? { remoteId: hit.uri, sentAt: hit.value?.createdAt ?? lookup.sentAfter } : null;
}
