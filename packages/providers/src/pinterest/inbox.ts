/*
 * Pinterest has no inbox.
 *
 * API v5 exposes boards, pins, media and analytics only. There is no endpoint
 * to LIST comments on a pin, none to CREATE a comment or reply, and no
 * messaging API of any kind for third-party apps. Rather than implement a
 * speculative surface, the adapter declares every inbox capability false with
 * the reasons below and omits `fetchInbox` / `reply` / `findReply` entirely, so
 * the contract and the capability flags agree (integrations.md: an unsupported
 * feature is disabled with an explanation, never silently missing).
 *
 * If Pinterest ships a comments API, this module is where it lands: implement
 * fetchInbox/reply/findReply here and flip the flags in client.ts `capsFor`.
 */
import type { Capabilities } from "../types";

export const INBOX: Capabilities["inbox"] = { comments: false, mentions: false, messages: false, reviews: false, reply: false };

export const INBOX_REASONS: Record<string, string> = {
  comments: "Pinterest API v5 has no endpoint to read comments on a pin.",
  mentions: "Pinterest API v5 has no mentions endpoint.",
  messages: "Pinterest has no messaging API for third-party apps.",
  reviews: "Pinterest has no reviews.",
  reply: "Pinterest API v5 cannot post comments or replies.",
  firstComment: "Pinterest API v5 cannot post comments, so a first comment cannot be scheduled with a pin.",
};
