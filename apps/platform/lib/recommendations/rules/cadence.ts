/*
 * Cadence gaps: a channel that has stopped posting at its own established rhythm.
 * Never compares channels to each other or to an invented benchmark — the only
 * yardstick is the channel's own median gap between its published posts.
 */
import { DEFINITIONS_VERSION } from "@/lib/analytics/metrics";
import { MIN, daysBetweenKeys, median, type ChannelFacts, type RecommendationDraft, type Rule, type WorkspaceFacts } from "../types";

/** A gap only counts as a lapse when it is clearly outside the channel's own rhythm. */
const MIN_LAPSE_DAYS = 3;

function gapsOf(posts: ChannelFacts["posts"]): number[] {
  const days = [...new Set(posts.map((p) => p.day))].sort();
  return days.slice(1).map((d, i) => daysBetweenKeys(days[i], d));
}

function draft(f: WorkspaceFacts, c: ChannelFacts): RecommendationDraft | null {
  if (c.posts.length < MIN.postsPerChannel) return null;
  const gaps = gapsOf(c.posts);
  const med = median(gaps);
  if (med === null || med <= 0) return null;
  const last = c.posts.reduce((a, p) => (p.day > a ? p.day : a), c.posts[0].day);
  const since = daysBetweenKeys(last, f.today);
  if (since < MIN_LAPSE_DAYS || since < Math.max(med * 2, med + 2)) return null;
  return {
    kind: "cadence_gap",
    target: c.channelId,
    channelId: c.channelId,
    title: `${c.name} has gone quiet`,
    body: `You normally publish to ${c.name} about every ${med} day${med === 1 ? "" : "s"}. The last post went out ${since} days ago, on ${last}. Getting back to your usual rhythm keeps the channel's reach from decaying.`,
    confidence: c.posts.length >= 20 ? "high" : c.posts.length >= 12 ? "medium" : "low",
    evidence: {
      metrics: [
        { label: "Median gap between posts", value: med, unit: "days" },
        { label: "Days since the last post", value: since, unit: "days" },
        { label: "Longest gap in the window", value: Math.max(...gaps, 0), unit: "days" },
      ],
      period: f.period,
      samples: [{ label: `Published posts on ${c.name}`, n: c.posts.length }],
      definitionsVersion: DEFINITIONS_VERSION,
      note: `Gaps are measured between publish days in ${f.timezone}.`,
    },
    action: { label: "Draft a post", segment: "create" },
  };
}

export const cadenceGapRule: Rule = (f) => f.channels.map((c) => draft(f, c)).filter((d): d is RecommendationDraft => d !== null);
