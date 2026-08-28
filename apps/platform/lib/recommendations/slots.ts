/*
 * Best-time bucketing, pure. Posts are grouped by weekday × hour in the
 * workspace timezone and scored by mean engagement rate (engagement ÷ reach,
 * lib/analytics/derive.ts). Buckets below the minimum sample are dropped, so an
 * empty result honestly means "not enough data".
 */
import { MIN, engagementRate, mean, round, type ChannelFacts, type PostFact } from "./types";
import type { SlotView } from "./slot-format";

/** A channel needs this many scored posts before any of its buckets are trusted. */
export const MIN_POSTS_PER_CHANNEL = 15;

export type ComputedSlot = SlotView;

/** Scored buckets for one channel, best first. Empty when the channel is under-sampled. */
export function computeSlots(c: ChannelFacts): ComputedSlot[] {
  const scored = c.posts.map((p) => ({ p, rate: engagementRate(p) })).filter((x): x is { p: PostFact; rate: number } => x.rate !== null);
  if (scored.length < MIN_POSTS_PER_CHANNEL) return [];
  const buckets = new Map<string, number[]>();
  for (const { p, rate } of scored) {
    const key = `${p.weekday}:${p.hour}`;
    buckets.set(key, [...(buckets.get(key) ?? []), rate]);
  }
  return [...buckets]
    .filter(([, rates]) => rates.length >= MIN.postsPerBucket)
    .map(([key, rates]) => {
      const [weekday, hour] = key.split(":").map(Number);
      return { channelId: c.channelId, weekday, hour, score: round(mean(rates)!, 6), sampleSize: rates.length };
    })
    .sort((a, b) => b.score - a.score || b.sampleSize - a.sampleSize);
}
