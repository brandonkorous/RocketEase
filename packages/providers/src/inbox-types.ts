/*
 * Engagement (inbox) contract. Adapters normalise comments, mentions, DMs and
 * reviews into InboxItem; the platform owns threading, contacts and state.
 */
export type InboxItemKind = "comment" | "mention" | "message" | "review";

export type InboxAuthor = {
  remoteId: string;
  name: string;
  handle?: string;
  avatarUrl?: string;
  profileUrl?: string;
};

export type InboxAttachment = { url: string; mimeType: string; name?: string; sizeBytes?: number };

export type InboxItem = {
  /** Provider id of this comment/message; unique per channel. */
  remoteId: string;
  /** Provider id of the thread (conversation id, root comment id, post id for reviews). */
  threadRemoteId: string;
  kind: InboxItemKind;
  direction: "inbound" | "outbound";
  author: InboxAuthor;
  text: string;
  attachments?: InboxAttachment[];
  occurredAt: string;
  inReplyToRemoteId?: string;
  /** Remote post this thread hangs off (comments/mentions). */
  postRemoteId?: string;
  postUrl?: string;
  /** Review rating 1–5 when kind = review. */
  rating?: number;
};

export type InboxPage = { items: InboxItem[]; cursor?: string };

export type ReplyRequest = {
  kind: InboxItemKind;
  threadRemoteId: string;
  inReplyToRemoteId?: string;
  /** Provider-side recipient for DMs (author remoteId). */
  recipientRemoteId?: string;
  /** Remote post the thread hangs off (needed by providers whose reply endpoint is post-scoped, e.g. TikTok). */
  postRemoteId?: string;
  text: string;
  /** Stable per attempt chain; used to reconcile ambiguous sends. */
  idempotencyKey: string;
};

export type ReplyResult = { remoteId: string; sentAt: string };
