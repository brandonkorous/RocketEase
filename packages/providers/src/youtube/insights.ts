/*
 * YouTube insights → canonical daily facts.
 *   YouTube Analytics API reports.query (ids=channel==MINE):
 *     dimensions=day                       → daily channel series
 *     dimensions=video&filters=video==...  → per-video totals FOR THE WINDOW
 *       (the API has no day×video time series report, so those totals are
 *        recorded on the last day of the window, like LinkedIn per-share stats)
 *   Data API channels.list?part=statistics → subscriber count snapshot.
 *
 * `estimatedMinutesWatched` is returned by the same report but has no entry in
 * the platform's canonical metric registry, so it is deliberately not requested.
 */
import type { CanonicalMetric, InsightFact, InsightsPage, InsightsRequest } from "../insights-types";
import type { ChannelDescriptor, Credential } from "../types";
import { ANALYTICS, yt } from "./client";

type Report = { columnHeaders?: { name?: string }[]; rows?: (string | number)[][] };

/** YouTube Analytics metric → canonical metric. */
const METRIC_MAP: Record<string, CanonicalMetric> = {
  views: "video_views",
  likes: "reactions",
  comments: "comments",
  shares: "shares",
  videosAddedToPlaylists: "saves",
  estimatedMinutesWatched: "watch_time_minutes",
};

const DAY_METRICS = ["views", "estimatedMinutesWatched", "likes", "comments", "shares", "videosAddedToPlaylists", "subscribersGained", "subscribersLost"];
const VIDEO_METRICS = ["views", "estimatedMinutesWatched", "likes", "comments", "shares", "videosAddedToPlaylists"];

const enc = encodeURIComponent;
const num = (v: string | number | undefined) => (typeof v === "number" ? v : Number(v ?? 0)) || 0;

/** Turn a reports.query grid into facts, keyed by the `day` or `video` dimension column. */
export function reportToFacts(report: Report, entity: InsightFact["entity"], fallbackDay: string): InsightFact[] {
  const cols = (report.columnHeaders ?? []).map((c) => c.name ?? "");
  const dayAt = cols.indexOf("day");
  const videoAt = cols.indexOf("video");
  const out: InsightFact[] = [];
  for (const row of report.rows ?? []) {
    const day = dayAt >= 0 ? String(row[dayAt]) : fallbackDay;
    const remoteId = videoAt >= 0 ? String(row[videoAt]) : undefined;
    for (let i = 0; i < cols.length; i++) {
      const metric = METRIC_MAP[cols[i]];
      if (metric) out.push({ entity, remoteId, metric, day, value: num(row[i]), source: `youtube.analytics.${cols[i]}` });
    }
    // follower_gain is net: gained minus lost (analytics.md "Net follower growth").
    const gained = cols.indexOf("subscribersGained");
    const lost = cols.indexOf("subscribersLost");
    if (gained >= 0) out.push({ entity, remoteId, metric: "follower_gain", day, value: num(row[gained]) - (lost >= 0 ? num(row[lost]) : 0), source: "youtube.analytics.subscribersGained" });
  }
  return out;
}

const query = (params: Record<string, string>) => `/reports?${new URLSearchParams(params).toString()}`;

async function channelSeries(token: string, req: InsightsRequest): Promise<InsightFact[]> {
  const res = await yt<Report>(query({ ids: "channel==MINE", startDate: req.since, endDate: req.until, metrics: DAY_METRICS.join(","), dimensions: "day" }), token, { base: ANALYTICS });
  return reportToFacts(res.body, "channel", req.until);
}

/** Per-video totals over the window; up to 500 video ids may be OR'd in one filter. */
async function videoTotals(token: string, ids: string[], req: InsightsRequest): Promise<InsightFact[]> {
  const out: InsightFact[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const filters = `video==${ids.slice(i, i + 200).join(",")}`;
    const res = await yt<Report>(
      query({ ids: "channel==MINE", startDate: req.since, endDate: req.until, metrics: VIDEO_METRICS.join(","), dimensions: "video", filters, sort: "-views", maxResults: "200" }),
      token,
      { base: ANALYTICS },
    ).catch(() => ({ body: {} as Report }));
    out.push(...reportToFacts(res.body, "post", req.until));
  }
  return out;
}

/** Subscriber count is a lifetime snapshot from the Data API, recorded on the fetch day. */
async function subscriberSnapshot(token: string, channelId: string, day: string): Promise<InsightFact[]> {
  const res = await yt<{ items?: { statistics?: { subscriberCount?: string } }[] }>(`/channels?part=statistics&id=${enc(channelId)}`, token).catch(() => ({ body: {} as { items?: [] } }));
  const count = res.body.items?.[0]?.statistics?.subscriberCount;
  return count === undefined ? [] : [{ entity: "channel", metric: "followers", day, value: Number(count) || 0, source: "youtube.channels.statistics.subscriberCount" }];
}

export async function fetchInsights(cred: Credential, ch: ChannelDescriptor, req: InsightsRequest): Promise<InsightsPage> {
  const t = cred.accessToken;
  if (!ch.capabilities.insights.organic) return { facts: await subscriberSnapshot(t, ch.remoteId, req.until), timezone: "UTC" };
  const [series, videos, subs] = await Promise.all([channelSeries(t, req), videoTotals(t, req.postRemoteIds ?? [], req), subscriberSnapshot(t, ch.remoteId, req.until)]);
  // YouTube Analytics buckets days in Pacific time (the channel's reporting timezone).
  return { facts: [...series, ...videos, ...subs], timezone: "America/Los_Angeles" };
}
