/*
 * X insights → canonical facts.
 *   GET /2/tweets?ids=…&tweet.fields=public_metrics,organic_metrics,non_public_metrics
 *     organic_metrics / non_public_metrics are user-context only, cover the
 *     authenticating account's OWN posts, and X keeps them for 30 days; older
 *     posts fall back to public_metrics.
 *   GET /2/users/me?user.fields=public_metrics → follower count.
 *
 * X publishes NO daily time series for organic posts, so per-post totals are
 * lifetime-to-date and recorded on the day they were fetched (the platform's
 * fact revisions track the growth), exactly as LinkedIn per-share stats are.
 *
 * `user_profile_clicks` is fetched by the same call but has no entry in the
 * canonical metric registry, so it is not emitted as a fact.
 */
import type { CanonicalMetric, InsightFact, InsightsPage, InsightsRequest } from "../insights-types";
import type { ChannelDescriptor, Credential } from "../types";
import { x } from "./client";

type Metrics = Record<string, number | undefined>;
type TweetRow = { id?: string; public_metrics?: Metrics; organic_metrics?: Metrics; non_public_metrics?: Metrics };

/** X metric key → canonical metric. Retweets and quotes both count as shares. */
const METRIC_MAP: [string, CanonicalMetric][] = [
  ["impression_count", "impressions"],
  ["like_count", "reactions"],
  ["reply_count", "comments"],
  ["retweet_count", "shares"],
  ["bookmark_count", "saves"],
  ["url_link_clicks", "link_clicks"],
];

const FIELDS = "tweet.fields=public_metrics,organic_metrics,non_public_metrics";

/**
 * Organic metrics win where present (they are the owner's view of the same
 * numbers); public_metrics fills the gaps. Quote posts are folded into shares.
 */
export function tweetToFacts(t: TweetRow, day: string): InsightFact[] {
  if (!t.id) return [];
  const out: InsightFact[] = [];
  const pick = (key: string): { value: number; source: string } | undefined => {
    for (const [bag, name] of [[t.organic_metrics, "organic_metrics"], [t.non_public_metrics, "non_public_metrics"], [t.public_metrics, "public_metrics"]] as const) {
      const v = bag?.[key];
      if (typeof v === "number") return { value: v, source: `x.${name}.${key}` };
    }
    return undefined;
  };
  for (const [key, metric] of METRIC_MAP) {
    const hit = pick(key);
    if (!hit) continue;
    const quotes = metric === "shares" ? (t.public_metrics?.quote_count ?? 0) : 0;
    out.push({ entity: "post", remoteId: t.id, metric, day, value: hit.value + quotes, source: hit.source });
  }
  return out;
}

async function postFacts(token: string, ids: string[], day: string): Promise<InsightFact[]> {
  const out: InsightFact[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100).map(encodeURIComponent).join(",");
    // Older posts lose organic/non-public metrics; retry with public metrics only.
    const res = await x<{ data?: TweetRow[] }>(`/tweets?ids=${batch}&${FIELDS}`, token).catch(() =>
      x<{ data?: TweetRow[] }>(`/tweets?ids=${batch}&tweet.fields=public_metrics`, token).catch(() => ({ body: { data: [] as TweetRow[] } })),
    );
    for (const t of res.body.data ?? []) out.push(...tweetToFacts(t, day));
  }
  return out;
}

async function followerFacts(token: string, day: string): Promise<InsightFact[]> {
  const res = await x<{ data?: { public_metrics?: Metrics } }>("/users/me?user.fields=public_metrics", token).catch(() => ({ body: {} as { data?: { public_metrics?: Metrics } } }));
  const n = res.body.data?.public_metrics?.followers_count;
  return typeof n === "number" ? [{ entity: "channel", metric: "followers", day, value: n, source: "x.public_metrics.followers_count" }] : [];
}

export async function fetchInsights(cred: Credential, _ch: ChannelDescriptor, req: InsightsRequest): Promise<InsightsPage> {
  const [posts, followers] = await Promise.all([postFacts(cred.accessToken, req.postRemoteIds ?? [], req.until), followerFacts(cred.accessToken, req.until)]);
  return { facts: [...posts, ...followers], timezone: "UTC" };
}
