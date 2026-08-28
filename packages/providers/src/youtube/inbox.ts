/*
 * YouTube inbox: comments on the channel's videos via commentThreads.list
 * (`allThreadsRelatedToChannelId`), replies via comments.insert. Threading uses
 * the top-level comment id. YouTube exposes no direct messages and no mention
 * feed to third-party apps, so those kinds never appear here.
 */
import type { InboxItem, InboxPage, ReplyLookup, ReplyRequest, ReplyResult } from "../inbox-types";
import type { ChannelDescriptor, Credential } from "../types";
import { ProviderError } from "../types";
import { now, videoUrl, yt } from "./client";

export type YtCommentSnippet = {
  parentId?: string;
  videoId?: string;
  channelId?: string;
  textOriginal?: string;
  textDisplay?: string;
  publishedAt?: string;
  authorDisplayName?: string;
  authorProfileImageUrl?: string;
  authorChannelUrl?: string;
  authorChannelId?: { value?: string };
};
export type YtComment = { id?: string; snippet?: YtCommentSnippet };
export type YtThread = { id?: string; snippet?: { videoId?: string; topLevelComment?: YtComment; totalReplyCount?: number }; replies?: { comments?: YtComment[] } };

const enc = encodeURIComponent;

export function commentToItem(c: YtComment, thread: string, ch: ChannelDescriptor): InboxItem {
  const s = c.snippet ?? {};
  const authorId = s.authorChannelId?.value;
  const mine = authorId === ch.remoteId;
  return {
    remoteId: c.id ?? thread,
    threadRemoteId: thread,
    kind: "comment",
    direction: mine ? "outbound" : "inbound",
    author: mine
      ? { remoteId: ch.remoteId, name: ch.name, avatarUrl: ch.avatarUrl }
      : { remoteId: authorId ?? s.authorDisplayName ?? "unknown", name: s.authorDisplayName ?? "YouTube viewer", avatarUrl: s.authorProfileImageUrl, profileUrl: s.authorChannelUrl },
    // textOriginal is the raw text; textDisplay carries YouTube's HTML entities and links.
    text: s.textOriginal ?? s.textDisplay ?? "",
    occurredAt: s.publishedAt ?? now(),
    inReplyToRemoteId: s.parentId,
    postRemoteId: s.videoId,
    postUrl: s.videoId ? videoUrl(s.videoId) : undefined,
  };
}

/** One page of threads plus their inline replies, newest first from the API. */
export function threadsToItems(threads: YtThread[], ch: ChannelDescriptor, since?: string): InboxItem[] {
  const out: InboxItem[] = [];
  for (const t of threads) {
    const top = t.snippet?.topLevelComment;
    const threadId = top?.id ?? t.id;
    if (!top || !threadId) continue;
    for (const c of [top, ...(t.replies?.comments ?? [])]) {
      const item = commentToItem(c, threadId, ch);
      if (!since || item.occurredAt > since) out.push(item);
    }
  }
  return out.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

async function threadPage(token: string, ch: ChannelDescriptor, cursor?: string): Promise<{ threads: YtThread[]; cursor?: string }> {
  const page = cursor ? `&pageToken=${enc(cursor)}` : "";
  const res = await yt<{ items?: YtThread[]; nextPageToken?: string }>(
    `/commentThreads?part=snippet,replies&maxResults=50&order=time&textFormat=plainText&allThreadsRelatedToChannelId=${enc(ch.remoteId)}${page}`,
    token,
  );
  return { threads: res.body.items ?? [], cursor: res.body.nextPageToken };
}

export async function fetchInbox(cred: Credential, ch: ChannelDescriptor, opts: { since?: string; cursor?: string }): Promise<InboxPage> {
  if (!ch.capabilities.inbox.comments) return { items: [] };
  // commentThreads has no `since` filter; order=time lets us stop at the cursor day.
  const page = await threadPage(cred.accessToken, ch, opts.cursor).catch((e) => {
    if (e instanceof ProviderError && e.category === "deleted") return { threads: [] as YtThread[], cursor: undefined };
    throw e;
  });
  return { items: threadsToItems(page.threads, ch, opts.since), cursor: page.cursor };
}

/** comments.insert replies under the top-level comment; YouTube has no nested reply chains. */
export async function reply(cred: Credential, ch: ChannelDescriptor, req: ReplyRequest): Promise<ReplyResult> {
  if (req.kind !== "comment") throw new ProviderError("YouTube only supports replying to comments.", { category: "permission" });
  if (!ch.capabilities.inbox.reply) throw new ProviderError("This YouTube channel did not grant comment management (youtube.force-ssl).", { category: "permission", providerCode: "insufficientPermissions" });
  const parentId = req.threadRemoteId;
  const res = await yt<YtComment>("/comments?part=snippet", cred.accessToken, { method: "POST", body: { snippet: { parentId, textOriginal: req.text } } });
  if (!res.body.id) throw new ProviderError("YouTube returned no comment id", { category: "unknown", ambiguous: true });
  return { remoteId: res.body.id, sentAt: res.body.snippet?.publishedAt ?? now() };
}

/**
 * YouTube comments carry no client reference, so an ambiguous reply is
 * reconciled structurally (ENG-003): our own comment, in the same thread, with
 * the same text, created at or after the attempt started.
 */
export async function findReply(cred: Credential, ch: ChannelDescriptor, lookup: ReplyLookup): Promise<ReplyResult | null> {
  const page = await threadPage(cred.accessToken, ch).catch(() => ({ threads: [] as YtThread[] }));
  const hit = threadsToItems(page.threads, ch).find(
    (i) => i.direction === "outbound" && i.threadRemoteId === lookup.threadRemoteId && i.text === lookup.text && i.occurredAt >= lookup.sentAfter,
  );
  return hit ? { remoteId: hit.remoteId, sentAt: hit.occurredAt } : null;
}
