/*
 * Threads insights → canonical facts.
 *   GET /{media}/insights?metric=views,likes,replies,reposts,quotes,shares   (lifetime)
 *   GET /{user}/threads_insights?metric=views&since&until                    (daily series)
 *   GET /{user}/threads_insights?metric=followers_count                      (total; takes no range)
 * Post metrics are lifetime totals recorded on the fetch day, as X and
 * LinkedIn are. `views` is Meta's media-view count and lands on impressions,
 * matching the Instagram mapping. Reposts, quotes and shares are all
 * re-distribution, so they fold into one `shares` fact with joint provenance.
 */
import type { CanonicalMetric, InsightFact, InsightsPage, InsightsRequest } from "../insights-types";
import type { ChannelDescriptor, Credential } from "../types";
import { threads } from "./client";

export type Metric = { name?: string; period?: string; values?: { value?: number; end_time?: string }[]; total_value?: { value?: number } };

const POST_METRICS = "views,likes,replies,reposts,quotes,shares";
const POST_MAP: Record<string, CanonicalMetric> = { views: "impressions", likes: "reactions", replies: "comments" };
const SHARE_LIKE = ["reposts", "quotes", "shares"];

/** Meta's end_time is the END of the day bucket, so the day is the instant before it. */
const dayOf = (endTime: string | undefined, fallback: string) => (endTime ? new Date(new Date(endTime).getTime() - 1).toISOString().slice(0, 10) : fallback);
const valueOf = (m: Metric) => m.total_value?.value ?? m.values?.[0]?.value;

export function postToFacts(remoteId: string, data: Metric[], day: string): InsightFact[] {
  const out: InsightFact[] = [];
  let shares = 0;
  const shareSources: string[] = [];
  for (const m of data) {
    const v = valueOf(m);
    if (!m.name || typeof v !== "number") continue;
    if (SHARE_LIKE.includes(m.name)) {
      shares += v;
      shareSources.push(m.name);
      continue;
    }
    const metric = POST_MAP[m.name];
    if (metric) out.push({ entity: "post", remoteId, metric, day, value: v, source: `threads.${m.name}` });
  }
  if (shareSources.length) out.push({ entity: "post", remoteId, metric: "shares", day, value: shares, source: `threads.${shareSources.join("+")}` });
  return out;
}

export function userToFacts(data: Metric[], fallbackDay: string): InsightFact[] {
  const out: InsightFact[] = [];
  for (const m of data) {
    if (m.name === "views") for (const v of m.values ?? []) if (typeof v.value === "number") out.push({ entity: "channel", metric: "impressions", day: dayOf(v.end_time, fallbackDay), value: v.value, source: "threads.views" });
    if (m.name === "followers_count") {
      const v = valueOf(m);
      if (typeof v === "number") out.push({ entity: "channel", metric: "followers", day: fallbackDay, value: v, source: "threads.followers_count" });
    }
  }
  return out;
}

const unix = (day: string, endOfDay = false) => String(Math.floor(Date.parse(`${day}T${endOfDay ? "23:59:59" : "00:00:00"}Z`) / 1000));

export async function fetchInsights(cred: Credential, ch: ChannelDescriptor, req: InsightsRequest): Promise<InsightsPage> {
  const t = cred.accessToken;
  const facts: InsightFact[] = [];
  const unsupported = new Set<string>();
  for (const id of req.postRemoteIds ?? []) {
    const res = await threads<{ data?: Metric[] }>(`/${id}/insights`, t, { params: { metric: POST_METRICS } }).catch(() => null);
    if (res) facts.push(...postToFacts(id, res.data ?? [], req.until));
  }
  const series = await threads<{ data?: Metric[] }>(`/${ch.remoteId}/threads_insights`, t, { params: { metric: "views", since: unix(req.since), until: unix(req.until, true) } }).catch(() => {
    unsupported.add("views");
    return { data: [] as Metric[] };
  });
  const followers = await threads<{ data?: Metric[] }>(`/${ch.remoteId}/threads_insights`, t, { params: { metric: "followers_count" } }).catch(() => {
    unsupported.add("followers_count");
    return { data: [] as Metric[] };
  });
  facts.push(...userToFacts([...(series.data ?? []), ...(followers.data ?? [])], req.until));
  // Meta buckets Threads days in Pacific time, like Instagram.
  return { facts, timezone: "America/Los_Angeles", unsupportedMetrics: unsupported.size ? [...unsupported] : undefined };
}
