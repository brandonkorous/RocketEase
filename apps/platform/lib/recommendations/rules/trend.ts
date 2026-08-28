/*
 * Declining reach or engagement: the last 14 days against the 14 before them,
 * per channel. Both windows must carry enough days of facts, so a gap in
 * ingestion reads as "not enough data" rather than as a decline.
 */
import { DEFINITIONS_VERSION } from "@/lib/analytics/metrics";
import { MIN, inRange, round, shiftKey, sum, type ChannelFacts, type DayFact, type RecommendationDraft, type Rule, type WorkspaceFacts } from "../types";

const WINDOW = 14;
/** Below this the movement is noise, not a trend worth acting on. */
const DROP = 0.2;

const pct = (v: number) => `${(Math.abs(v) * 100).toFixed(1)}%`;

type Compared = { metric: "reach" | "engagement"; current: number; previous: number; drop: number; days: number; priorDays: number };

function compare(metric: Compared["metric"], days: DayFact[], to: string): Compared | null {
  const cur = inRange(days, shiftKey(to, -(WINDOW - 1)), to);
  const prev = inRange(days, shiftKey(to, -(WINDOW * 2 - 1)), shiftKey(to, -WINDOW));
  if (cur.length < MIN.daysPerWindow || prev.length < MIN.daysPerWindow) return null;
  const current = sum(cur.map((d) => d.value));
  const previous = sum(prev.map((d) => d.value));
  if (previous <= 0) return null;
  return { metric, current, previous, drop: (previous - current) / previous, days: cur.length, priorDays: prev.length };
}

function draft(f: WorkspaceFacts, c: ChannelFacts, w: Compared): RecommendationDraft {
  const name = w.metric === "reach" ? "Reach" : "Engagement";
  return {
    kind: "declining_trend",
    target: `${c.channelId}:${w.metric}`,
    channelId: c.channelId,
    title: `${name} is falling on ${c.name}`,
    body: `${name} over the last ${WINDOW} days totalled ${Math.round(w.current).toLocaleString()} against ${Math.round(w.previous).toLocaleString()} in the ${WINDOW} days before — down ${pct(w.drop)}. Check what changed in cadence, format, or timing before spending more on this channel.`,
    confidence: w.drop >= 0.4 && w.days === WINDOW && w.priorDays === WINDOW ? "high" : w.drop >= 0.3 ? "medium" : "low",
    evidence: {
      metrics: [
        { label: `${name} — last ${WINDOW} days`, value: round(w.current, 0), unit: "count" },
        { label: `${name} — previous ${WINDOW} days`, value: round(w.previous, 0), unit: "count" },
        { label: "Change", value: round(-w.drop), unit: "percent" },
      ],
      period: { from: shiftKey(f.period.to, -(WINDOW * 2 - 1)), to: f.period.to },
      samples: [{ label: "Days of facts in the recent window", n: w.days }, { label: "Days of facts in the prior window", n: w.priorDays }],
      definitionsVersion: DEFINITIONS_VERSION,
      note: "Daily channel-level facts; both windows need at least 7 days of data before a comparison is made.",
    },
    action: { label: "Open channel analytics", segment: "analytics", query: { channel: c.channelId, range: "28d" } },
  };
}

function forChannel(f: WorkspaceFacts, c: ChannelFacts): RecommendationDraft[] {
  const candidates = [compare("reach", c.reachByDay, f.period.to), compare("engagement", c.engagementByDay, f.period.to)];
  return candidates.filter((w): w is Compared => w !== null && w.drop >= DROP).map((w) => draft(f, c, w));
}

export const decliningTrendRule: Rule = (f) => f.channels.flatMap((c) => forChannel(f, c));
