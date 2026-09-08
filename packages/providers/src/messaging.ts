/*
 * Direct messages (M14.7). What each network lets a connected account send in
 * a DM thread, with the document behind every number: how long after the
 * customer's last message a reply may still go (Meta's "standard messaging
 * window"), the longer window a network offers a PERSON, and any published cap
 * on sends. A network with no DM API says why, in the adapter's own words.
 * A number nobody published is not here: the "~200 automated DMs an hour"
 * vendor blogs repeat appears in no Meta document, so it is not declared.
 */
import type { Network } from "./types";

export type MessagingRules =
  | {
      dm: true;
      /** Hours after the customer's last message a reply may still be sent; null when the network has no window. */
      windowHours: number | null;
      /** A longer window the network offers a person (Meta's Human Agent tag), in days, and what it needs. */
      personWindow?: { days: number; needs: string };
      /** Published caps on sends from one account. */
      caps?: { per15min?: number; per24h?: number };
      doc: string;
      note?: string;
    }
  | { dm: false; why: string };

const META_POLICY = "https://developers.facebook.com/documentation/business-messaging/messenger-platform/policy";
const HUMAN_AGENT = { days: 7, needs: "its Human Agent feature, which RocketEase has not been granted yet" };

export const MESSAGING_RULES: Record<Network, MessagingRules> = {
  // "up to 24 hours to respond to a user"; the Human Agent tag lets a person "manually respond to user messages within a 7-day period".
  facebook: {
    dm: true,
    windowHours: 24,
    personWindow: HUMAN_AGENT,
    doc: META_POLICY,
    note: "Meta caps Messenger API calls at 200 × the people the Page messaged in the last 24 h (graph-api/overview/rate-limiting); at one message per call that is 200 messages per person per day, which an inbox reply never reaches, so it is not enforced here.",
  },
  // Same policy page covers the IG Messaging API; Meta publishes per-second call limits for it and none per hour.
  instagram: {
    dm: true,
    windowHours: 24,
    personWindow: HUMAN_AGENT,
    doc: META_POLICY,
    note: "Meta's Instagram messaging limits are per second (100 sends a second for text); the ~200 an hour that vendor tools use is their own pacing, not Meta's, and is not declared here.",
  },
  // Per user: 15 sends per 15 minutes and 1,440 per 24 hours on every dm_conversations POST endpoint. No messaging window.
  x: { dm: true, windowHours: null, caps: { per15min: 15, per24h: 1440 }, doc: "https://docs.x.com/x-api/fundamentals/rate-limits" },
  // The demo network mirrors Meta's window so the rule can be exercised locally.
  mock: { dm: true, windowHours: 24, doc: "packages/providers/src/mock/inbox.ts" },
  linkedin: { dm: false, why: "LinkedIn does not expose Page or member messaging to third-party apps." },
  tiktok: { dm: false, why: "TikTok does not expose direct messages to third-party apps." },
  threads: { dm: false, why: "Threads has no direct-message API." },
  youtube: { dm: false, why: "YouTube has no API for direct messages." },
  pinterest: { dm: false, why: "Pinterest has no messaging API for third-party apps." },
  google_business: { dm: false, why: "Business Messages (the chat product) was shut down by Google and has no replacement API." },
  bluesky: { dm: false, why: "Bluesky chat needs an app password created with direct-message access and a second service (chat.bsky); not wired yet." },
};

/** Why this network cannot carry direct messages; undefined when it can. */
export function dmWhy(network: Network): string | undefined {
  const r = MESSAGING_RULES[network];
  return r.dm ? undefined : r.why;
}
