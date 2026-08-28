/*
 * Meta organic insights → canonical daily facts. Page insights via
 * /{page}/insights (period=day), IG via /{ig}/insights (metric list differs),
 * post insights per remote id. Metric names are kept as provenance.
 */
import type { CanonicalMetric, InsightFact, InsightsPage, InsightsRequest } from "../insights-types";
import type { ChannelDescriptor, Credential, ProviderConfig } from "../types";
import { graph } from "./graph";

type Series = { name: string; period?: string; values?: { value: number | Record<string, number>; end_time?: string }[] };
const token = (cred: Credential, ch: ChannelDescriptor) => ch.channelToken ?? cred.accessToken;
const dayOf = (endTime: string | undefined, fallback: string) => (endTime ? new Date(new Date(endTime).getTime() - 1).toISOString().slice(0, 10) : fallback);
const num = (v: number | Record<string, number>) => (typeof v === "number" ? v : Object.values(v).reduce((s, x) => s + x, 0));

const PAGE_MAP: Record<string, CanonicalMetric> = { page_impressions: "impressions", page_impressions_unique: "reach", page_post_engagements: "engagement", page_video_views: "video_views", page_fans: "followers", page_fan_adds: "follower_gain", page_consumptions_by_consumption_type: "link_clicks" };
const IG_MAP: Record<string, CanonicalMetric> = { impressions: "impressions", reach: "reach", follower_count: "follower_gain", website_clicks: "link_clicks" };
const POST_FB_MAP: Record<string, CanonicalMetric> = { post_impressions: "impressions", post_impressions_unique: "reach", post_reactions_by_type_total: "reactions", post_clicks: "link_clicks", post_video_views: "video_views" };
const POST_IG_MAP: Record<string, CanonicalMetric> = { impressions: "impressions", reach: "reach", likes: "reactions", comments: "comments", shares: "shares", saved: "saves", video_views: "video_views" };

function toFacts(series: Series[], map: Record<string, CanonicalMetric>, entity: InsightFact["entity"], remoteId: string | undefined, fallbackDay: string): InsightFact[] {
  const out: InsightFact[] = [];
  for (const s of series) {
    const metric = map[s.name];
    if (!metric) continue;
    for (const v of s.values ?? []) out.push({ entity, remoteId, metric, day: dayOf(v.end_time, fallbackDay), value: num(v.value), source: `meta.${s.name}` });
  }
  return out;
}

async function channelSeries(cfg: ProviderConfig, t: string, ch: ChannelDescriptor, req: InsightsRequest): Promise<InsightFact[]> {
  const ig = ch.kind === "instagram_business";
  const metrics = Object.keys(ig ? IG_MAP : PAGE_MAP).join(",");
  const res = await graph<{ data?: Series[] }>(`/${ch.remoteId}/insights`, cfg, t, { params: { metric: metrics, period: "day", since: req.since, until: req.until } });
  const facts = toFacts(res.data ?? [], ig ? IG_MAP : PAGE_MAP, "channel", undefined, req.until);
  if (ig) {
    const acct = await graph<{ followers_count?: number }>(`/${ch.remoteId}`, cfg, t, { params: { fields: "followers_count" } }).catch(() => ({ followers_count: undefined }));
    if (acct.followers_count != null) facts.push({ entity: "channel", metric: "followers", day: req.until, value: acct.followers_count, source: "meta.followers_count" });
  }
  return facts;
}

/** Post insights are lifetime totals on Meta; we store them on the day fetched and let revisions track growth. */
async function postFacts(cfg: ProviderConfig, t: string, ch: ChannelDescriptor, postId: string, day: string): Promise<InsightFact[]> {
  const ig = ch.kind === "instagram_business";
  const map = ig ? POST_IG_MAP : POST_FB_MAP;
  const res = await graph<{ data?: Series[] }>(`/${postId}/insights`, cfg, t, { params: { metric: Object.keys(map).join(",") } }).catch(() => ({ data: [] as Series[] }));
  return toFacts(res.data ?? [], map, "post", postId, day);
}

export async function fetchInsights(cfg: ProviderConfig, cred: Credential, ch: ChannelDescriptor, req: InsightsRequest): Promise<InsightsPage> {
  const t = token(cred, ch);
  const facts = await channelSeries(cfg, t, ch, req);
  for (const id of req.postRemoteIds ?? []) facts.push(...(await postFacts(cfg, t, ch, id, req.until)));
  return { facts, timezone: "America/Los_Angeles" }; // Meta reports Page insights in Pacific time
}
