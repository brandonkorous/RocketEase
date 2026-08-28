/*
 * Reuse candidates: posts old enough to be re-run that clearly beat their own
 * channel's median engagement rate. The action is "repost or make a template",
 * pointed at the post detail page where Duplicate and Save as template live.
 */
import { DEFINITIONS_VERSION } from "@/lib/analytics/metrics";
import { MIN, daysBetweenKeys, engagementRate, median, round, type ChannelFacts, type PostFact, type RecommendationDraft, type Rule, type WorkspaceFacts } from "../types";

const MIN_AGE_DAYS = 30;
/** A winner must beat the channel median by half again before we suggest re-running it. */
const LIFT = 0.5;
const PER_CHANNEL = 2;

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

function draft(f: WorkspaceFacts, c: ChannelFacts, p: PostFact, rate: number, base: number, n: number): RecommendationDraft {
  const age = daysBetweenKeys(p.day, f.today);
  return {
    kind: "reuse_candidate",
    target: `${c.channelId}:${p.itemId}`,
    channelId: c.channelId,
    contentItemId: p.itemId,
    title: `Re-run “${p.title}” on ${c.name}`,
    body: `This ${p.format} post earned ${pct(rate)} engagement rate — ${pct(rate / base - 1)} above the ${c.name} median of ${pct(base)} — and it published ${age} days ago. Duplicate it for a fresh run, or save it as a template so the shape is reusable.`,
    confidence: n >= 20 ? "high" : n >= 12 ? "medium" : "low",
    evidence: {
      metrics: [
        { label: "Engagement rate — this post", value: round(rate), unit: "percent" },
        { label: "Engagement rate — channel median", value: round(base), unit: "percent" },
        { label: "Reach", value: p.reach, unit: "count" },
        { label: "Engagement", value: p.engagement, unit: "count" },
        { label: "Age", value: age, unit: "days" },
      ],
      period: f.period,
      samples: [{ label: `Posts with reach on ${c.name}`, n }],
      definitionsVersion: DEFINITIONS_VERSION,
      note: "Reach is unique within a network and a day only; comparisons stay inside one channel.",
    },
    action: { label: "Open the post", segment: `posts/${p.itemId}` },
  };
}

function forChannel(f: WorkspaceFacts, c: ChannelFacts): RecommendationDraft[] {
  const scored = c.posts.map((p) => ({ p, rate: engagementRate(p) })).filter((x): x is { p: PostFact; rate: number } => x.rate !== null);
  if (scored.length < MIN.postsPerChannel) return [];
  const base = median(scored.map((x) => x.rate));
  if (base === null || base <= 0) return [];
  return scored
    .filter((x) => daysBetweenKeys(x.p.day, f.today) >= MIN_AGE_DAYS && x.rate >= base * (1 + LIFT))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, PER_CHANNEL)
    .map((x) => draft(f, c, x.p, x.rate, base, scored.length));
}

export const reuseCandidateRule: Rule = (f) => f.channels.flatMap((c) => forChannel(f, c));
