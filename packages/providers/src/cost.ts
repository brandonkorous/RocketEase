/*
 * What one publish costs, per channel — money, API quota, or a daily post cap.
 * Backs the composer's "Before you publish" panel (docs/research/trends-2026.md
 * §1 and opportunity #2: publish-cost transparency before queuing).
 *
 * Every number below is sourced. A network we cannot source gets NO entry and
 * the UI says "no per-post cost" / "no published limit" — never a guessed one.
 *
 * Sources
 *   X         ~$0.015 per post; $0.20 for a post containing a link
 *             (postproxy.dev/blog/x-api-pricing-2026)
 *   YouTube   10,000 quota units/day; a video upload costs 1,600 (~6/day)
 *             (getphyllo.com/post/youtube-api-limits-...)
 *   TikTok    unaudited clients: 5 posts/24h, private only, until the Content
 *             Posting audit (developers.tiktok.com content-posting-api)
 *   Instagram 50 published posts/24h (Meta content_publishing_limit) and
 *             ~200 API calls/hour per account (storrito.com/elfsight.com)
 *   Threads   250 API-published posts per profile in a 24-hour moving window,
 *             1,000 replies (developers.facebook.com/docs/threads/overview,
 *             read 2026-09-05). Free.
 *   Bluesky   free; writes are metered in points (a create is 3) against
 *             5,000/hour and 35,000/day per account (docs.bsky.app rate
 *             limits) — a budget, not a posts-per-day cap, so no dailyCap.
 *   Facebook, LinkedIn, Pinterest — no per-post charge and no published-post
 *             cap we can source. They deliberately return {}.
 */

import type { ChannelKind, ProviderKey } from "./types";

export type CostWindow = "hour" | "day" | "24h";
/** Windows a post cap can be expressed in. */
export type CapWindow = Extract<CostWindow, "day" | "24h">;

export type PublishCost = {
  /** Real money the network bills us for this publish. */
  money?: { amount: number; currency: "USD"; note: string };
  /** API budget this publish consumes out of a periodic allowance. */
  quota?: { units: number; of: number; window: CostWindow };
  /** How many posts the network accepts in a rolling window. */
  dailyCap?: { count: number; window: CapWindow; note: string };
};

/** The parts of a draft variant that can change what a publish costs. */
export type CostVariant = {
  hasLink?: boolean;
  hasVideo?: boolean;
  mediaCount?: number;
};

/** Sourced prose per provider, for footnotes and the accounts screen. */
export const PROVIDER_COST_NOTES: Record<ProviderKey, string> = {
  x: "X charges per post: ~$0.015, or $0.20 when the post contains a link (postproxy.dev, 2026 pricing).",
  youtube: "YouTube gives each app 10,000 quota units a day; one video upload costs 1,600, so roughly 6 uploads a day across the whole workspace.",
  tiktok: "Until TikTok approves the Content Posting audit, apps may post for 5 users per 24 hours and every post is private.",
  meta: "Instagram allows 50 published posts per 24 hours per account and about 200 API calls an hour. Facebook Pages have no per-post charge and no published-post limit we can source.",
  linkedin: "LinkedIn charges nothing per post and publishes no per-post limit we can source.",
  pinterest: "Pinterest API v5 is free; there is no per-post charge and no published-post limit we can source.",
  google_business: "The Business Profile API is free. Nothing is published to a location from here, so there is no publish cost; the review quota is 300 requests a minute once Google approves the project.",
  threads: "The Threads API is free. A profile may publish 250 posts and 1,000 replies through the API in any 24-hour window.",
  bluesky: "Bluesky is free. Writes are metered in points (a post costs 3) against 5,000 an hour and 35,000 a day per account; there is no per-post charge.",
  mock: "The demo network is local only. Nothing is billed and nothing is capped.",
};

const X_PLAIN_POST_USD = 0.015;
const X_LINK_POST_USD = 0.2;
const YOUTUBE_DAILY_UNITS = 10_000;
const YOUTUBE_UPLOAD_UNITS = 1_600;
const YOUTUBE_UPLOADS_PER_DAY = 6;
const TIKTOK_UNAUDITED_POSTS = 5;
const INSTAGRAM_POSTS_PER_24H = 50;
const THREADS_POSTS_PER_24H = 250;

/**
 * Cost of publishing this variant to one channel. `{}` means "we know of no
 * charge and no cap" — the caller must render that as such, not as zero cost
 * for something we simply failed to look up.
 */
export function estimatePublishCost(provider: ProviderKey, kind: ChannelKind, variant: CostVariant = {}): PublishCost {
  if (provider === "mock") return {};
  switch (kind) {
    case "x_account":
      return xCost(variant);
    case "youtube_channel":
      return youtubeCost();
    case "tiktok_account":
      return {
        dailyCap: { count: TIKTOK_UNAUDITED_POSTS, window: "24h", note: "Unaudited apps may post for 5 users per 24 hours, and every post lands private." },
      };
    case "instagram_business":
      return {
        dailyCap: { count: INSTAGRAM_POSTS_PER_24H, window: "24h", note: "Instagram allows 50 published posts per 24 hours per account." },
      };
    case "threads_profile":
      return {
        dailyCap: { count: THREADS_POSTS_PER_24H, window: "24h", note: "Threads allows 250 API-published posts per profile in a 24-hour moving window." },
      };
    default:
      // facebook_page, linkedin_*, pinterest_*, bluesky_account, mock_profile: nothing sourced as a per-post cap.
      return {};
  }
}

function xCost(variant: CostVariant): PublishCost {
  const link = Boolean(variant.hasLink);
  return {
    money: {
      amount: link ? X_LINK_POST_USD : X_PLAIN_POST_USD,
      currency: "USD",
      note: link ? "Posts with links cost more than plain posts on X." : "X bills per post; adding a link raises it to $0.20.",
    },
  };
}

/**
 * Every YouTube publish is a video upload, so the 1,600-unit charge applies
 * regardless of what the draft currently holds. Media count and duration have
 * no sourced effect on the quota cost.
 */
function youtubeCost(): PublishCost {
  return {
    quota: { units: YOUTUBE_UPLOAD_UNITS, of: YOUTUBE_DAILY_UNITS, window: "day" },
    dailyCap: { count: YOUTUBE_UPLOADS_PER_DAY, window: "day", note: "10,000 units a day ÷ 1,600 per upload is about 6 uploads a day for the whole workspace." },
  };
}

/** True when we have nothing sourced to charge or cap for this channel. */
export function isFreeToPublish(cost: PublishCost): boolean {
  return !cost.money && !cost.quota && !cost.dailyCap;
}
