/*
 * Hiding a comment (M14.6). Which networks let a connected account take a
 * comment out of public view through their API, with the document each
 * answer came from. A network with no such endpoint says why, in the words
 * the inbox shows next to the comment — the platform records that reason
 * rather than pretending the comment is gone.
 */
import type { Network } from "./types";

export type HideSupport = { hide: true; doc: string; note?: string } | { hide: false; why: string };

export const HIDE_SUPPORT: Record<Network, HideSupport> = {
  // POST /{comment-id}?is_hidden=true — Page comments only; answers {success}.
  facebook: { hide: true, doc: "https://developers.facebook.com/docs/graph-api/reference/comment/#updating" },
  // POST /{ig-comment-id}?hide=true — a comment by the media owner stays visible whatever is sent.
  instagram: { hide: true, doc: "https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-comment#updating" },
  // POST /{reply-id}/manage_reply?hide=true.
  threads: { hide: true, doc: "https://developers.facebook.com/docs/threads/reply-management#hide-replies", note: "Hiding a top-level reply also hides every reply under it." },
  // POST /comments/setModerationStatus — heldForReview takes it out of public view; published puts it back. 50 quota units.
  youtube: { hide: true, doc: "https://developers.google.com/youtube/v3/docs/comments/setModerationStatus", note: "YouTube has no hide: the comment is held for review, which takes it out of public view until someone publishes it again." },
  // PUT /2/tweets/{id}/hidden {hidden:true} — replies to the account's own posts only; needs tweet.moderate.write.
  x: { hide: true, doc: "https://docs.x.com/x-api/posts/hide-replies", note: "Only replies to the account's own posts can be hidden, and the account must have granted tweet.moderate.write." },
  mock: { hide: true, doc: "packages/providers/src/mock/inbox.ts" },
  linkedin: { hide: false, why: "LinkedIn's API has no way to hide a comment. Hide or delete it on LinkedIn." },
  tiktok: { hide: false, why: "RocketEase does not hide TikTok comments yet. Hide it in the TikTok app." },
  pinterest: { hide: false, why: "Pinterest's API has no comments at all." },
  google_business: { hide: false, why: "A Google review cannot be hidden. Reply to it, or report it to Google from Business Profile." },
  bluesky: { hide: false, why: "RocketEase does not manage Bluesky thread gates yet. Hide the reply in the Bluesky app." },
};

/** Why this network cannot hide a comment; undefined when it can. */
export function hideWhy(network: Network): string | undefined {
  const s = HIDE_SUPPORT[network];
  return s.hide ? undefined : s.why;
}
