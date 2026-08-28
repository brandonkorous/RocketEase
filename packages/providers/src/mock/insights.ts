/*
 * Mock insights: deterministic per-channel/per-day numbers (seeded hash) so
 * charts are stable across polls and revisions can be simulated on demand.
 */
import type { CanonicalMetric, InsightFact, InsightsPage, InsightsRequest } from "../insights-types";

const CHANNEL_METRICS: { metric: CanonicalMetric; base: number; spread: number; source: string }[] = [
  { metric: "impressions", base: 4200, spread: 1800, source: "mock.page_impressions" },
  { metric: "reach", base: 2600, spread: 900, source: "mock.page_reach" },
  { metric: "engagement", base: 310, spread: 140, source: "mock.page_engaged_users" },
  { metric: "link_clicks", base: 48, spread: 30, source: "mock.link_clicks" },
  { metric: "followers", base: 12_000, spread: 0, source: "mock.followers_count" },
  { metric: "follower_gain", base: 18, spread: 14, source: "mock.follower_gain" },
];
const POST_METRICS: { metric: CanonicalMetric; base: number; spread: number; source: string }[] = [
  { metric: "impressions", base: 900, spread: 600, source: "mock.post_impressions" },
  { metric: "reach", base: 700, spread: 400, source: "mock.post_reach" },
  { metric: "reactions", base: 40, spread: 30, source: "mock.post_reactions" },
  { metric: "comments", base: 6, spread: 6, source: "mock.post_comments" },
  { metric: "shares", base: 4, spread: 4, source: "mock.post_shares" },
  { metric: "saves", base: 3, spread: 3, source: "mock.post_saves" },
  { metric: "link_clicks", base: 12, spread: 10, source: "mock.post_clicks" },
];

/** Small string hash → [0,1). Stable across processes. */
function unit(key: string) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
}

function* days(since: string, until: string) {
  const d = new Date(`${since}T00:00:00Z`);
  const end = new Date(`${until}T00:00:00Z`);
  while (d <= end) {
    yield d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

let revisionBump = 0;
export const mockInsights = {
  /** Shift every subsequent value so a re-ingest produces revisions (tests data-quality paths). */
  bumpRevision() { revisionBump++; },
  reset() { revisionBump = 0; },
};

export async function fetchInsights(channelRemoteId: string, req: InsightsRequest): Promise<InsightsPage> {
  const facts: InsightFact[] = [];
  let followers = 0;
  for (const day of days(req.since, req.until)) {
    const dayIndex = Math.floor(Date.parse(day) / 86_400_000);
    for (const m of CHANNEL_METRICS) {
      const u = unit(`${channelRemoteId}:${m.metric}:${day}`);
      let value = Math.round(m.base + (u - 0.5) * 2 * m.spread + (dayIndex % 7 < 2 ? -m.spread * 0.4 : 0) + revisionBump * 3);
      if (m.metric === "followers") { followers = followers || m.base + (dayIndex % 1000) * 7; followers += Math.round(unit(`${channelRemoteId}:gain:${day}`) * 30); value = followers; }
      facts.push({ entity: "channel", metric: m.metric, day, value: Math.max(0, value), source: m.source });
    }
    for (const post of req.postRemoteIds ?? []) {
      const age = unit(`${post}:age`);
      for (const m of POST_METRICS) {
        const u = unit(`${post}:${m.metric}:${day}`);
        facts.push({ entity: "post", remoteId: post, metric: m.metric, day, value: Math.max(0, Math.round((m.base + (u - 0.5) * 2 * m.spread) * (0.5 + age) + revisionBump)), source: m.source });
      }
    }
  }
  return { facts, timezone: "UTC" };
}
