/*
 * Format performance: which post format outperforms the channel's own median
 * engagement rate. Formats are compared only within one channel — networks
 * count engagement and reach differently (analytics.md metric contract).
 */
import { DEFINITIONS_VERSION } from "@/lib/analytics/metrics";
import { MIN, engagementRate, mean, median, round, type ChannelFacts, type RecommendationDraft, type Rule, type WorkspaceFacts } from "../types";

/** The winning format must beat the channel median by this much to be worth saying. */
const LIFT = 0.25;

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

function ratesByFormat(c: ChannelFacts) {
  const buckets = new Map<string, number[]>();
  for (const p of c.posts) {
    const r = engagementRate(p);
    if (r === null) continue;
    buckets.set(p.format, [...(buckets.get(p.format) ?? []), r]);
  }
  return [...buckets].filter(([, rs]) => rs.length >= MIN.postsPerFormat).map(([format, rs]) => ({ format, n: rs.length, rate: mean(rs)! }));
}

function draft(f: WorkspaceFacts, c: ChannelFacts): RecommendationDraft | null {
  const rates = c.posts.map(engagementRate).filter((r): r is number => r !== null);
  if (rates.length < MIN.postsPerChannel) return null;
  const base = median(rates);
  if (base === null || base <= 0) return null;
  const formats = ratesByFormat(c).sort((a, b) => b.rate - a.rate);
  const best = formats[0];
  if (!best || formats.length < 2 || best.rate < base * (1 + LIFT)) return null;
  const lift = best.rate / base - 1;
  return {
    kind: "format_performance",
    target: `${c.channelId}:${best.format}`,
    channelId: c.channelId,
    title: `${best.format} posts outperform on ${c.name}`,
    body: `Your ${best.format} posts on ${c.name} average ${pct(best.rate)} engagement rate against a channel median of ${pct(base)} — ${pct(lift)} higher. Weighting more of the plan toward ${best.format} is the cheapest lever you have here.`,
    confidence: best.n >= 10 && rates.length >= 20 ? "high" : best.n >= 5 ? "medium" : "low",
    evidence: {
      metrics: [
        { label: `Engagement rate — ${best.format}`, value: round(best.rate), unit: "percent" },
        { label: "Engagement rate — channel median", value: round(base), unit: "percent" },
        ...formats.slice(1).map((x) => ({ label: `Engagement rate — ${x.format}`, value: round(x.rate), unit: "percent" as const })),
      ],
      period: f.period,
      samples: [{ label: `${best.format} posts`, n: best.n }, ...formats.slice(1).map((x) => ({ label: `${x.format} posts`, n: x.n })), { label: `All posts with reach on ${c.name}`, n: rates.length }],
      definitionsVersion: DEFINITIONS_VERSION,
      note: "Engagement rate is engagement ÷ reach, averaged per post. Formats need at least 3 posts to be scored.",
    },
    action: { label: "Open channel analytics", segment: "analytics", query: { channel: c.channelId } },
  };
}

export const formatPerformanceRule: Rule = (f) => f.channels.map((c) => draft(f, c)).filter((d): d is RecommendationDraft => d !== null);
