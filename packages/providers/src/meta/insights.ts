/*
 * Meta organic insights → canonical daily facts. Page insights via
 * /{page}/insights (period=day), IG via /{ig}/insights (metric list differs),
 * post insights per remote id. Metric names are kept as provenance.
 *
 * Meta retired its whole impressions/reach/fans family in two waves —
 * 15 Nov 2025 (impressions, page fans) and 15 Jun 2026 (the *_unique family) —
 * and replaced it with media views. The successor names below are Meta's own,
 * from its published deprecation table. What the change means to a reader
 * lives in the platform's metric registry, not here.
 */
import type { CanonicalMetric, InsightFact, InsightsPage, InsightsRequest } from "../insights-types";
import { ProviderError, type ChannelDescriptor, type Credential, type ProviderConfig } from "../types";
import { graph } from "./graph";

type Series = { name: string; period?: string; values?: { value: number | Record<string, number>; end_time?: string }[] };
const token = (cred: Credential, ch: ChannelDescriptor) => ch.channelToken ?? cred.accessToken;
const dayOf = (endTime: string | undefined, fallback: string) => (endTime ? new Date(new Date(endTime).getTime() - 1).toISOString().slice(0, 10) : fallback);
const num = (v: number | Record<string, number>) => (typeof v === "number" ? v : Object.values(v).reduce((s, x) => s + x, 0));

/*
 * A media view is not an impression and a media viewer is not reach, so the
 * unique one lands on `viewers`, never on `reach`. Meta gave page-level link
 * clicks (page_consumptions_by_consumption_type) no successor at all; post
 * clicks still carry it.
 */
const PAGE_MAP: Record<string, CanonicalMetric> = { page_media_view: "impressions", page_total_media_view_unique: "viewers", page_post_engagements: "engagement", page_video_views: "video_views", page_follows: "followers" };
const POST_FB_MAP: Record<string, CanonicalMetric> = { post_media_view: "impressions", post_total_media_view_unique: "viewers", post_reactions_by_type_total: "reactions", post_clicks: "link_clicks", post_video_views: "video_views" };
/** IG dropped `impressions` for media created after 1 Jul 2024; `views` is its replacement. Untested live — no IG channel is connected yet. */
const IG_MAP: Record<string, CanonicalMetric> = { views: "impressions", reach: "reach", follower_count: "follower_gain", website_clicks: "link_clicks" };
const POST_IG_MAP: Record<string, CanonicalMetric> = { views: "impressions", reach: "reach", likes: "reactions", comments: "comments", shares: "shares", saved: "saves", video_views: "video_views" };

/** page_fan_adds was retired with no replacement. Net growth is follows − unfollows; gross follows alone is a different number. */
const FOLLOWS = "page_daily_follows_unique";
const UNFOLLOWS = "page_daily_unfollows_unique";

function toFacts(series: Series[], map: Record<string, CanonicalMetric>, entity: InsightFact["entity"], remoteId: string | undefined, fallbackDay: string): InsightFact[] {
  const out: InsightFact[] = [];
  for (const s of series) {
    const metric = map[s.name];
    if (!metric) continue;
    for (const v of s.values ?? []) out.push({ entity, remoteId, metric, day: dayOf(v.end_time, fallbackDay), value: num(v.value), source: `meta.${s.name}` });
  }
  return out;
}

/** Net daily follower growth. Both halves or neither: gross adds reported as net would be a different metric wearing its name. */
function netFollowerGain(series: Series[], fallbackDay: string): InsightFact[] {
  const adds = series.find((s) => s.name === FOLLOWS);
  const removes = series.find((s) => s.name === UNFOLLOWS);
  if (!adds || !removes) return [];
  const lost = new Map((removes.values ?? []).map((v) => [dayOf(v.end_time, fallbackDay), num(v.value)]));
  return (adds.values ?? []).map((v) => {
    const day = dayOf(v.end_time, fallbackDay);
    return { entity: "channel" as const, metric: "follower_gain" as const, day, value: num(v.value) - (lost.get(day) ?? 0), source: `meta.${FOLLOWS}-${UNFOLLOWS}` };
  });
}

/** Code 100 on an insights call means a metric name in the list is not valid for this object. */
const isRetiredMetric = (e: unknown) => e instanceof ProviderError && e.category === "validation" && (e.providerCode ?? "").startsWith("100");

/**
 * Meta rejects the WHOLE request when any one metric name is not valid, so a
 * single dead name silently zeroes out every other metric. On that error we ask
 * for each metric on its own, keep what still works, and name what does not.
 */
async function seriesFor(cfg: ProviderConfig, t: string, path: string, metrics: string[], params: Record<string, string>): Promise<{ series: Series[]; unsupported: string[] }> {
  try {
    const res = await graph<{ data?: Series[] }>(path, cfg, t, { params: { ...params, metric: metrics.join(",") } });
    return { series: res.data ?? [], unsupported: [] };
  } catch (err) {
    if (!isRetiredMetric(err)) throw err;
    if (metrics.length === 1) return { series: [], unsupported: metrics };
    const series: Series[] = [];
    const unsupported: string[] = [];
    for (const m of metrics) {
      const one = await seriesFor(cfg, t, path, [m], params);
      series.push(...one.series);
      unsupported.push(...one.unsupported);
    }
    return { series, unsupported };
  }
}

async function channelSeries(cfg: ProviderConfig, t: string, ch: ChannelDescriptor, req: InsightsRequest): Promise<{ facts: InsightFact[]; unsupported: string[] }> {
  const ig = ch.kind === "instagram_business";
  const map = ig ? IG_MAP : PAGE_MAP;
  const ask = ig ? Object.keys(map) : [...Object.keys(map), FOLLOWS, UNFOLLOWS];
  const { series, unsupported } = await seriesFor(cfg, t, `/${ch.remoteId}/insights`, ask, { period: "day", since: req.since, until: req.until });
  const facts = toFacts(series, map, "channel", undefined, req.until);
  if (!ig) facts.push(...netFollowerGain(series, req.until));
  if (ig) {
    const acct = await graph<{ followers_count?: number }>(`/${ch.remoteId}`, cfg, t, { params: { fields: "followers_count" } }).catch(() => ({ followers_count: undefined }));
    if (acct.followers_count != null) facts.push({ entity: "channel", metric: "followers", day: req.until, value: acct.followers_count, source: "meta.followers_count" });
  }
  return { facts, unsupported };
}

/** Post insights are lifetime totals on Meta; we store them on the day fetched and let revisions track growth. */
async function postFacts(cfg: ProviderConfig, t: string, ch: ChannelDescriptor, postId: string, day: string): Promise<{ facts: InsightFact[]; unsupported: string[] }> {
  const ig = ch.kind === "instagram_business";
  const map = ig ? POST_IG_MAP : POST_FB_MAP;
  const r = await seriesFor(cfg, t, `/${postId}/insights`, Object.keys(map), {}).catch(() => ({ series: [] as Series[], unsupported: [] as string[] }));
  return { facts: toFacts(r.series, map, "post", postId, day), unsupported: r.unsupported };
}

export async function fetchInsights(cfg: ProviderConfig, cred: Credential, ch: ChannelDescriptor, req: InsightsRequest): Promise<InsightsPage> {
  const t = token(cred, ch);
  const channel = await channelSeries(cfg, t, ch, req);
  const facts = channel.facts;
  const unsupported = new Set(channel.unsupported);
  for (const id of req.postRemoteIds ?? []) {
    const post = await postFacts(cfg, t, ch, id, req.until);
    facts.push(...post.facts);
    for (const m of post.unsupported) unsupported.add(m);
  }
  // Meta reports Page insights in Pacific time.
  return { facts, timezone: "America/Los_Angeles", unsupportedMetrics: unsupported.size ? [...unsupported] : undefined };
}
