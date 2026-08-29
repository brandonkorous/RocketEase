/*
 * Google Business Profile inbox: reviews only.
 *
 * A location's reviews are the whole conversation surface — there are no
 * comments, mentions or DMs (see client.ts reasons). Each review is its own
 * thread; the owner's answer is the single reply Google allows, so a thread is
 * at most two messages: the review, then our reply.
 *
 * Endpoints (v4 — reviews were never migrated to the v1 APIs):
 *   GET    /v4/{location}/reviews                — list
 *   GET    /v4/{location}/reviews/{reviewId}     — get one (reconciliation)
 *   PUT    /v4/{location}/reviews/{reviewId}/reply — create or replace the reply
 */
import type { InboxItem, InboxPage, ReplyLookup, ReplyRequest, ReplyResult } from "../inbox-types";
import type { ChannelDescriptor, Credential } from "../types";
import { ProviderError } from "../types";
import { gbp, now, REPLY_MAX_BYTES } from "./client";

export type GbpReviewer = { displayName?: string; profilePhotoUrl?: string; isAnonymous?: boolean };
export type GbpReviewReply = { comment?: string; updateTime?: string };
export type GbpReview = {
  name?: string;
  reviewId?: string;
  reviewer?: GbpReviewer;
  starRating?: string;
  comment?: string;
  createTime?: string;
  updateTime?: string;
  reviewReply?: GbpReviewReply;
};
export type GbpReviewPage = { reviews?: GbpReview[]; nextPageToken?: string; averageRating?: number; totalReviewCount?: number };

const STARS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

/** STAR_RATING_UNSPECIFIED and anything unknown become undefined, never 0. */
export const ratingOf = (starRating?: string): number | undefined => (starRating ? STARS[starRating] : undefined);

/** Google gives the owner's answer no id of its own; derive a stable one from the review. */
export const replyRemoteId = (reviewId: string) => `${reviewId}:reply`;

/** The review author, or Google's anonymous placeholder. */
function authorOf(r: GbpReview, reviewId: string) {
  const anon = r.reviewer?.isAnonymous === true || !r.reviewer?.displayName;
  return anon
    ? { remoteId: `anonymous:${reviewId}`, name: "A Google user" }
    : { remoteId: r.reviewer!.displayName!, name: r.reviewer!.displayName!, avatarUrl: r.reviewer?.profilePhotoUrl };
}

/** One review → the inbound review item plus our existing answer, when there is one. */
export function reviewToItems(r: GbpReview, ch: ChannelDescriptor): InboxItem[] {
  const reviewId = r.reviewId ?? r.name?.split("/").pop();
  if (!reviewId) return [];
  const at = r.updateTime ?? r.createTime ?? now();
  const items: InboxItem[] = [
    {
      remoteId: reviewId,
      threadRemoteId: reviewId,
      kind: "review",
      direction: "inbound",
      author: authorOf(r, reviewId),
      // A star-only review carries no comment; the rating is the whole message.
      text: r.comment ?? "",
      occurredAt: at,
      rating: ratingOf(r.starRating),
    },
  ];
  if (r.reviewReply?.comment) {
    items.push({
      remoteId: replyRemoteId(reviewId),
      threadRemoteId: reviewId,
      kind: "review",
      direction: "outbound",
      author: { remoteId: ch.remoteId, name: ch.name, avatarUrl: ch.avatarUrl },
      text: r.reviewReply.comment,
      occurredAt: r.reviewReply.updateTime ?? at,
      inReplyToRemoteId: reviewId,
    });
  }
  return items;
}

export function reviewsToItems(reviews: GbpReview[], ch: ChannelDescriptor, since?: string): InboxItem[] {
  return reviews
    .flatMap((r) => reviewToItems(r, ch))
    .filter((i) => !since || i.occurredAt > since)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

/**
 * Newest first so a `since` cursor can stop early. Google returns at most 50 a
 * page; the platform's cursor carries `nextPageToken` between polls.
 */
export async function fetchInbox(cred: Credential, ch: ChannelDescriptor, opts: { since?: string; cursor?: string }): Promise<InboxPage> {
  if (!ch.capabilities.inbox.reviews) return { items: [] };
  const page = await gbp<GbpReviewPage>(`/${ch.remoteId}/reviews`, cred.accessToken, {
    query: { pageSize: "50", orderBy: "updateTime desc", pageToken: opts.cursor },
  }).catch((e) => {
    if (e instanceof ProviderError && e.category === "deleted") return { body: {} as GbpReviewPage };
    throw e;
  });
  return { items: reviewsToItems(page.body.reviews ?? [], ch, opts.since), cursor: page.body.nextPageToken };
}

/** PUT creates or REPLACES the single reply Google allows on a review. */
export async function reply(cred: Credential, ch: ChannelDescriptor, req: ReplyRequest): Promise<ReplyResult> {
  if (req.kind !== "review") throw new ProviderError("A Google Business Profile location only carries reviews.", { category: "validation", providerCode: "kind_unsupported" });
  const bytes = new TextEncoder().encode(req.text).length;
  if (bytes > REPLY_MAX_BYTES) throw new ProviderError(`A review reply is limited to ${REPLY_MAX_BYTES} bytes; this one is ${bytes}.`, { category: "validation", providerCode: "reply_too_long" });
  const res = await gbp<GbpReviewReply>(`/${ch.remoteId}/reviews/${encodeURIComponent(req.threadRemoteId)}/reply`, cred.accessToken, { method: "PUT", body: { comment: req.text } });
  return { remoteId: replyRemoteId(req.threadRemoteId), sentAt: res.body.updateTime ?? now() };
}

/**
 * ENG-003. The reply endpoint is an upsert with no client reference, so an
 * ambiguous send is reconciled by reading the review back: our answer is there,
 * with this text, at or after the attempt started.
 */
export async function findReply(cred: Credential, ch: ChannelDescriptor, lookup: ReplyLookup): Promise<ReplyResult | null> {
  const res = await gbp<GbpReview>(`/${ch.remoteId}/reviews/${encodeURIComponent(lookup.threadRemoteId)}`, cred.accessToken).catch(() => null);
  const answer = res?.body.reviewReply;
  if (!answer?.comment || answer.comment !== lookup.text) return null;
  const at = answer.updateTime ?? now();
  return at >= lookup.sentAfter ? { remoteId: replyRemoteId(lookup.threadRemoteId), sentAt: at } : null;
}
