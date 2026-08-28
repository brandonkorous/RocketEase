/*
 * TikTok insights → canonical facts.
 *   Display API (always): lifetime follower count and per-video totals,
 *   recorded on the day fetched (revisions track growth).
 *   Business Account API (video.insights scope): daily account series.
 */
import type { CanonicalMetric, InsightFact, InsightsPage, InsightsRequest } from "../insights-types";
import type { ChannelDescriptor, Credential } from "../types";
import { biz, tt } from "./client";

type UserStats = { follower_count?: number; likes_count?: number };
type VideoStats = { id: string; view_count?: number; like_count?: number; comment_count?: number; share_count?: number };
type DailyPoint = { date?: string } & Record<string, number | string | undefined>;
type BizAccount = { followers_count?: number; video_views?: DailyPoint[]; likes?: DailyPoint[]; comments?: DailyPoint[]; shares?: DailyPoint[]; profile_views?: DailyPoint[] };

const VIDEO_MAP: [keyof VideoStats, CanonicalMetric][] = [["view_count", "video_views"], ["like_count", "reactions"], ["comment_count", "comments"], ["share_count", "shares"]];
const DAILY_MAP: [keyof BizAccount, CanonicalMetric][] = [["video_views", "video_views"], ["likes", "reactions"], ["comments", "comments"], ["shares", "shares"], ["profile_views", "impressions"]];

async function snapshotFacts(token: string, day: string): Promise<InsightFact[]> {
  const me = await tt<{ data?: { user?: UserStats } }>("/user/info/?fields=follower_count,likes_count", token).catch(() => ({ data: {} as { user?: UserStats } }));
  const u = me.data?.user;
  return typeof u?.follower_count === "number" ? [{ entity: "channel", metric: "followers", day, value: u.follower_count, source: "tiktok.user.follower_count" }] : [];
}

async function videoFacts(token: string, ids: string[], day: string): Promise<InsightFact[]> {
  const out: InsightFact[] = [];
  for (let i = 0; i < ids.length; i += 20) {
    const r = await tt<{ data?: { videos?: VideoStats[] } }>("/video/query/?fields=id,view_count,like_count,comment_count,share_count", token, { filters: { video_ids: ids.slice(i, i + 20) } }).catch(() => ({ data: { videos: [] as VideoStats[] } }));
    for (const v of r.data?.videos ?? []) for (const [key, metric] of VIDEO_MAP) if (typeof v[key] === "number") out.push({ entity: "post", remoteId: v.id, metric, day, value: v[key] as number, source: `tiktok.video.${key}` });
  }
  return out;
}

function series(points: DailyPoint[] | undefined, key: string, metric: CanonicalMetric): InsightFact[] {
  return (points ?? []).flatMap((p) => (p.date && typeof p[key] === "number" ? [{ entity: "channel" as const, metric, day: p.date, value: p[key] as number, source: `tiktok.business.${key}` }] : []));
}

/** Daily account metrics from /business/get/ (max 30-day windows). */
async function dailyFacts(token: string, businessId: string, req: InsightsRequest): Promise<InsightFact[]> {
  const fields = JSON.stringify(["followers_count", "video_views", "likes", "comments", "shares", "profile_views"]);
  const acct = await biz<BizAccount>("/business/get/", token, { query: { business_id: businessId, fields, start_date: req.since, end_date: req.until } });
  const out: InsightFact[] = [];
  for (const [key, metric] of DAILY_MAP) out.push(...series(acct[key] as DailyPoint[] | undefined, key, metric));
  if (typeof acct.followers_count === "number") out.push({ entity: "channel", metric: "followers", day: req.until, value: acct.followers_count, source: "tiktok.business.followers_count" });
  return out;
}

export async function fetchInsights(cred: Credential, ch: ChannelDescriptor, req: InsightsRequest): Promise<InsightsPage> {
  const t = cred.accessToken;
  const facts = ch.capabilities.insights.audience ? await dailyFacts(t, ch.remoteId, req) : await snapshotFacts(t, req.until);
  facts.push(...(await videoFacts(t, req.postRemoteIds ?? [], req.until)));
  return { facts, timezone: "UTC" };
}
