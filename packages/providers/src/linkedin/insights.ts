/*
 * LinkedIn organization analytics → canonical daily facts.
 *   organizationalEntityShareStatistics  (DAY intervals, Page-level)
 *   organizationalEntityFollowerStatistics (DAY intervals → follower_gain)
 *   networkSizes (total followers, snapshot on the day fetched)
 *   per-share statistics are lifetime totals (LinkedIn has no daily per-post series).
 */
import type { CanonicalMetric, InsightFact, InsightsPage, InsightsRequest } from "../insights-types";
import type { ChannelDescriptor, Credential } from "../types";
import { li } from "./client";

type Totals = { impressionCount?: number; uniqueImpressionsCount?: number; clickCount?: number; likeCount?: number; commentCount?: number; shareCount?: number; engagement?: number };
type ShareStat = { totalShareStatistics?: Totals; timeRange?: { start: number; end: number }; share?: string; ugcPost?: string };
type FollowerStat = { followerGains?: { organicFollowerGain?: number; paidFollowerGain?: number }; timeRange?: { start: number; end: number } };

const SHARE_MAP: [keyof Totals, CanonicalMetric][] = [["impressionCount", "impressions"], ["uniqueImpressionsCount", "reach"], ["clickCount", "link_clicks"], ["likeCount", "reactions"], ["commentCount", "comments"], ["shareCount", "shares"]];
const enc = encodeURIComponent;
const dayOf = (start: number | undefined, fallback: string) => (start ? new Date(start).toISOString().slice(0, 10) : fallback);
const epoch = (day: string) => Date.parse(`${day}T00:00:00Z`);
const intervals = (req: InsightsRequest) => `timeIntervals=(timeRange:(start:${epoch(req.since)},end:${epoch(req.until) + 86_400_000}),timeGranularityType:DAY)`;

function totalsToFacts(t: Totals | undefined, entity: InsightFact["entity"], remoteId: string | undefined, day: string): InsightFact[] {
  if (!t) return [];
  const out: InsightFact[] = [];
  for (const [key, metric] of SHARE_MAP) if (typeof t[key] === "number") out.push({ entity, remoteId, metric, day, value: t[key] as number, source: `linkedin.${key}` });
  if (typeof t.engagement === "number") out.push({ entity, remoteId, metric: "engagement", day, value: Math.round(t.engagement * 10_000) / 10_000, source: "linkedin.engagement" });
  return out;
}

async function pageSeries(token: string, org: string, req: InsightsRequest): Promise<InsightFact[]> {
  const res = await li<{ elements?: ShareStat[] }>(`/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${enc(org)}&${intervals(req)}`, token);
  return (res.body.elements ?? []).flatMap((e) => totalsToFacts(e.totalShareStatistics, "channel", undefined, dayOf(e.timeRange?.start, req.until)));
}

async function followerSeries(token: string, org: string, req: InsightsRequest): Promise<InsightFact[]> {
  const res = await li<{ elements?: FollowerStat[] }>(`/organizationalEntityFollowerStatistics?q=organizationalEntity&organizationalEntity=${enc(org)}&${intervals(req)}`, token);
  const facts: InsightFact[] = (res.body.elements ?? []).map((e) => ({ entity: "channel" as const, metric: "follower_gain" as const, day: dayOf(e.timeRange?.start, req.until), value: (e.followerGains?.organicFollowerGain ?? 0) + (e.followerGains?.paidFollowerGain ?? 0), source: "linkedin.followerGains" }));
  const size = await li<{ firstDegreeSize?: number }>(`/networkSizes/${enc(org)}?edgeType=CompanyFollowedByMember`, token).catch(() => ({ body: {} as { firstDegreeSize?: number } }));
  if (typeof size.body.firstDegreeSize === "number") facts.push({ entity: "channel", metric: "followers", day: req.until, value: size.body.firstDegreeSize, source: "linkedin.networkSizes.firstDegreeSize" });
  return facts;
}

/** Lifetime per-post totals, recorded on the day fetched (revisions track growth). */
async function postFacts(token: string, org: string, posts: string[], day: string): Promise<InsightFact[]> {
  const shares = posts.filter((p) => p.includes(":share:"));
  const ugc = posts.filter((p) => p.includes(":ugcPost:"));
  const out: InsightFact[] = [];
  for (const [param, ids] of [["shares", shares], ["ugcPosts", ugc]] as const) {
    if (!ids.length) continue;
    const list = `List(${ids.map(enc).join(",")})`;
    const res = await li<{ elements?: ShareStat[] }>(`/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${enc(org)}&${param}=${list}`, token).catch(() => ({ body: { elements: [] as ShareStat[] } }));
    for (const e of res.body.elements ?? []) out.push(...totalsToFacts(e.totalShareStatistics, "post", e.share ?? e.ugcPost, day));
  }
  return out;
}

export async function fetchInsights(cred: Credential, ch: ChannelDescriptor, req: InsightsRequest): Promise<InsightsPage> {
  const t = cred.accessToken;
  const [page, followers, posts] = await Promise.all([pageSeries(t, ch.remoteId, req), followerSeries(t, ch.remoteId, req), postFacts(t, ch.remoteId, req.postRemoteIds ?? [], req.until)]);
  return { facts: [...page, ...followers, ...posts], timezone: "UTC" };
}
