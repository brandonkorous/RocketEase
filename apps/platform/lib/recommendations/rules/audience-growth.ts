/*
 * Audience growth stalls: net follower growth over the last 28 days against the
 * 28 before it, per channel. Net growth is new followers minus unfollows
 * (analytics.md), so a flat number is a real stall, not a missing metric.
 */
import { DEFINITIONS_VERSION } from "@/lib/analytics/metrics";
import { inRange, round, shiftKey, sum, type ChannelFacts, type RecommendationDraft, type Rule, type WorkspaceFacts } from "../types";

const WINDOW = 28;
const MIN_DAYS = 14;
/** Growth that has lost half its pace, or gone negative, is worth surfacing. */
const SLOWDOWN = 0.5;

function forChannel(f: WorkspaceFacts, c: ChannelFacts): RecommendationDraft | null {
  const to = f.period.to;
  const cur = inRange(c.followerGainByDay, shiftKey(to, -(WINDOW - 1)), to);
  const prev = inRange(c.followerGainByDay, shiftKey(to, -(WINDOW * 2 - 1)), shiftKey(to, -WINDOW));
  if (cur.length < MIN_DAYS || prev.length < MIN_DAYS) return null;
  const current = sum(cur.map((d) => d.value));
  const previous = sum(prev.map((d) => d.value));
  if (previous <= 0) return null;
  const drop = (previous - current) / previous;
  if (drop < SLOWDOWN) return null;
  const negative = current < 0;
  return {
    kind: "audience_growth_stall",
    target: c.channelId,
    channelId: c.channelId,
    title: negative ? `${c.name} is losing followers` : `Follower growth has stalled on ${c.name}`,
    body: `Net growth over the last ${WINDOW} days is ${Math.round(current).toLocaleString()} against ${Math.round(previous).toLocaleString()} in the ${WINDOW} days before. ${negative ? "More people left than joined." : `That is ${(drop * 100).toFixed(0)}% slower.`} Growth follows publishing: check cadence and which formats still earn reach here.`,
    confidence: cur.length === WINDOW && prev.length === WINDOW ? (negative ? "high" : "medium") : "low",
    evidence: {
      metrics: [
        { label: `Net follower growth — last ${WINDOW} days`, value: round(current, 0), unit: "count" },
        { label: `Net follower growth — previous ${WINDOW} days`, value: round(previous, 0), unit: "count" },
        { label: "Change", value: round(-drop), unit: "percent" },
      ],
      period: { from: shiftKey(to, -(WINDOW * 2 - 1)), to },
      samples: [{ label: "Days of facts in the recent window", n: cur.length }, { label: "Days of facts in the prior window", n: prev.length }],
      definitionsVersion: DEFINITIONS_VERSION,
      note: "Net follower growth is new followers minus unfollows, per network. One person following two networks counts twice.",
    },
    action: { label: "Open channel analytics", segment: "analytics", query: { channel: c.channelId, range: "90d" } },
  };
}

export const audienceGrowthRule: Rule = (f) => f.channels.map((c) => forChannel(f, c)).filter((d): d is RecommendationDraft => d !== null);
