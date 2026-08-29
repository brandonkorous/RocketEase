/*
 * Metric contract registry (analytics.md "Metric contract", ANA-002).
 * Every displayed metric resolves to one of these; the UI shows the
 * definition and freshness next to the number. Bump DEFINITIONS_VERSION
 * whenever a formula or mapping changes so exports can be compared.
 */
import type { CanonicalMetric } from "@make-it-social/providers";

export const DEFINITIONS_VERSION = "2026.08.2";

export type DisplayMetric = CanonicalMetric | "roas" | "revenue" | "sessions" | "viewers" | "engagement_rate" | "ctr" | "cpm" | "cpc" | "ctr_paid" | "cpa";
export type ProviderKey = "mock" | "meta" | "linkedin" | "tiktok" | "youtube" | "pinterest" | "x" | "ga4" | "shopify" | "webhook";

/**
 * A dated break in what a metric counts, for one provider. Series must never be
 * stitched across one: charts split, exports and reports name the change.
 */
export type MetricBreak = {
  /** First day the new definition applies (YYYY-MM-DD, provider calendar). */
  effectiveFrom: string;
  provider: ProviderKey;
  previous: { name: string; formula: string };
  next: { name: string; formula: string };
  note: string;
};
/** Paid-only keys; values exist only when an ad account is connected (M6). */
export const PAID_METRICS: DisplayMetric[] = ["spend", "conversions", "cpm", "cpc", "ctr_paid", "cpa", "roas"];
/** Keys a conversion tracking source supplies (M7). `trackingUnavailable` answers these before the paid fallback. */
export const TRACKING_METRICS: DisplayMetric[] = ["conversions", "revenue", "sessions", "roas"];

export type MetricContract = {
  key: DisplayMetric;
  name: string;
  definition: string;
  formula: string;
  unit: "count" | "percent" | "currency" | "ratio";
  aggregation: "sum" | "last" | "ratio";
  grains: ("day" | "post" | "channel")[];
  providers: Partial<Record<ProviderKey, string>>;
  freshnessHours: number;
  /** Why this may be unavailable right now (paid metrics before M6, tracking not connected…). */
  unavailable?: string;
  caveat?: string;
  /** Dated definition changes affecting this metric (see MetricBreak). */
  breaks?: MetricBreak[];
};

const P = { mock: "mock.*", meta: "insights API", linkedin: "organizationalEntityShareStatistics", tiktok: "business insights" };
const ADS = { mock: "mock ads", meta: "Marketing API /act_{id}/insights" };
/** M7 conversion sources (lib/tracking); attribution is theirs, we import what they report. */
const TRACKING_SOURCES = { ga4: "Data API runReport", shopify: "Admin GraphQL orders", webhook: "signed conversion webhook" };
const PAID_NOTE = "Paid only: imported daily from connected ad accounts in the account currency; no currency conversion is applied.";

/*
 * Meta's June 2026 metric retirement (docs/research/trends-2026.md §1). Vendor
 * migration notes agree on the swap; they disagree on the day (15–19 Jun 2026)
 * and Meta's public changelog names none, so we annotate from the earliest.
 */
const META_BREAK_FROM = "2026-06-15";
const META_BREAK_NOTE =
  "Meta retired its reach and impressions family in June 2026 and replaced it with media views / media viewers (plus a page viewer metric). What is counted changed from an impression (content entered the screen) to a media view (the media was rendered), so figures either side of this date are different measurements, not a continuation. Vendor migration notes date the switch 15–19 Jun 2026; Meta's public Graph API changelog names no day, so we annotate from the earliest reported. Meta backfills the new metrics from 1 May 2025 only.";
const metaBreak = (previous: MetricBreak["previous"], next: MetricBreak["next"]): MetricBreak => ({ effectiveFrom: META_BREAK_FROM, provider: "meta", previous, next, note: META_BREAK_NOTE });
const META_RETIRING = "insights API — retiring: unique impressions to 2026-06-14, media viewers from 2026-06-15";

export const METRICS: Record<DisplayMetric, MetricContract> = {
  impressions: { key: "impressions", name: "Impressions", definition: "Times your content was displayed. Repeat views count again.", formula: "Σ provider impressions", unit: "count", aggregation: "sum", grains: ["day", "post", "channel"], providers: P, freshnessHours: 24, breaks: [metaBreak({ name: "Video impressions / Story impressions", formula: "Σ times the video or story was delivered" }, { name: "Media views", formula: "Σ times the media was played or displayed" })] },
  reach: { key: "reach", name: "Reach", definition: "Accounts that saw your content at least once, per network.", formula: "Σ per-network daily reach", unit: "count", aggregation: "sum", grains: ["day", "post", "channel"], providers: { ...P, meta: META_RETIRING }, freshnessHours: 24, caveat: "Reach is unique within a network and a day only. Totals across networks or days are additive, not deduplicated. On Meta, reach became a media-viewer count in June 2026 and is not comparable across that date.", breaks: [metaBreak({ name: "Post and Page reach (unique impressions)", formula: "unique accounts the content entered the screen for" }, { name: "Post and Page reach (unique media viewers)", formula: "unique accounts that viewed the media" })] },
  video_views: { key: "video_views", name: "Video views", definition: "Views that met the network's own threshold (e.g. 3 s on Facebook, 2 s on TikTok).", formula: "Σ provider video views", unit: "count", aggregation: "sum", grains: ["day", "post"], providers: P, freshnessHours: 24, caveat: "Thresholds differ per network; compare within a network.", breaks: [metaBreak({ name: "Unique video views", formula: "Σ views past the network threshold" }, { name: "Media views", formula: "Σ times the media was played" })] },
  reactions: { key: "reactions", name: "Reactions", definition: "Likes and other reactions on posts.", formula: "Σ reactions", unit: "count", aggregation: "sum", grains: ["day", "post"], providers: P, freshnessHours: 24 },
  comments: { key: "comments", name: "Comments", definition: "Comments and replies on posts.", formula: "Σ comments", unit: "count", aggregation: "sum", grains: ["day", "post"], providers: P, freshnessHours: 24 },
  shares: { key: "shares", name: "Shares", definition: "Shares, reposts, and sends.", formula: "Σ shares", unit: "count", aggregation: "sum", grains: ["day", "post"], providers: P, freshnessHours: 24 },
  saves: { key: "saves", name: "Saves", definition: "Bookmarks/saves where the network reports them.", formula: "Σ saves", unit: "count", aggregation: "sum", grains: ["day", "post"], providers: P, freshnessHours: 24 },
  engagement: { key: "engagement", name: "Engagement", definition: "All interactions: reactions + comments + shares + saves (+ clicks where the network counts them).", formula: "Σ provider engagement (or the sum of its parts when a network has no total)", unit: "count", aggregation: "sum", grains: ["day", "post", "channel"], providers: P, freshnessHours: 24 },
  link_clicks: { key: "link_clicks", name: "Link clicks", definition: "Clicks on links in your content.", formula: "Σ link clicks", unit: "count", aggregation: "sum", grains: ["day", "post", "channel"], providers: P, freshnessHours: 24 },
  followers: { key: "followers", name: "Followers", definition: "Total followers at the end of the period, per network.", formula: "last daily value per channel, summed across channels", unit: "count", aggregation: "last", grains: ["day", "channel"], providers: P, freshnessHours: 24, caveat: "One person following two networks counts twice." },
  watch_time_minutes: { key: "watch_time_minutes", name: "Watch time", definition: "Minutes of video watched (YouTube estimatedMinutesWatched).", formula: "Σ estimated minutes watched", unit: "count", aggregation: "sum", grains: ["day", "post", "channel"], providers: { youtube: "reports.query estimatedMinutesWatched" }, freshnessHours: 48, caveat: "Only YouTube reports watch time; other networks report views with their own thresholds." },
  follower_gain: { key: "follower_gain", name: "Net follower growth", definition: "New followers minus unfollows.", formula: "Σ daily net change", unit: "count", aggregation: "sum", grains: ["day", "channel"], providers: P, freshnessHours: 24 },
  engagement_rate: { key: "engagement_rate", name: "Engagement rate", definition: "Engagement divided by reach.", formula: "engagement ÷ reach", unit: "percent", aggregation: "ratio", grains: ["day", "post", "channel"], providers: P, freshnessHours: 24, caveat: "Denominator is reach, not followers." },
  ctr: { key: "ctr", name: "Click-through rate", definition: "Link clicks divided by impressions.", formula: "link_clicks ÷ impressions", unit: "percent", aggregation: "ratio", grains: ["day", "post", "channel"], providers: P, freshnessHours: 24 },
  conversions: { key: "conversions", name: "Conversions", definition: "Conversions attributed to your social traffic: the ad platform's own count for paid clicks, plus what a connected tracking source reports for everything else.", formula: "Σ ad-reported paid conversions + Σ source-reported conversions on non-paid mediums", unit: "count", aggregation: "sum", grains: ["day", "post"], providers: { ...ADS, ...TRACKING_SOURCES }, freshnessHours: 24, caveat: "The two halves never overlap: a click whose utm_medium is a paid medium is counted once by the ad platform, never again by the tracking source. Each source applies its own attribution model and window, shown next to the number." },
  spend: { key: "spend", name: "Spend", definition: "Paid media spend reported by connected ad accounts.", formula: "Σ ad campaign daily spend", unit: "currency", aggregation: "sum", grains: ["day", "post"], providers: ADS, freshnessHours: 24, caveat: PAID_NOTE },
  cpm: { key: "cpm", name: "CPM", definition: "Cost per 1,000 paid impressions.", formula: "spend ÷ paid impressions × 1000", unit: "currency", aggregation: "ratio", grains: ["day"], providers: ADS, freshnessHours: 24, caveat: PAID_NOTE },
  cpc: { key: "cpc", name: "CPC", definition: "Cost per paid link click.", formula: "spend ÷ paid link clicks", unit: "currency", aggregation: "ratio", grains: ["day"], providers: ADS, freshnessHours: 24, caveat: PAID_NOTE },
  ctr_paid: { key: "ctr_paid", name: "CTR (paid)", definition: "Paid link clicks divided by paid impressions.", formula: "paid link_clicks ÷ paid impressions", unit: "percent", aggregation: "ratio", grains: ["day"], providers: ADS, freshnessHours: 24, caveat: PAID_NOTE },
  cpa: { key: "cpa", name: "Cost per result", definition: "Spend divided by provider-attributed conversions.", formula: "spend ÷ conversions", unit: "currency", aggregation: "ratio", grains: ["day"], providers: ADS, freshnessHours: 24, caveat: PAID_NOTE },
  roas: { key: "roas", name: "ROAS", definition: "Return on ad spend: revenue a tracking source attributed to paid social clicks, divided by the spend that bought them.", formula: "paid-medium revenue ÷ spend", unit: "ratio", aggregation: "ratio", grains: ["day"], providers: TRACKING_SOURCES, freshnessHours: 24, caveat: "Revenue is the tracking source's own last-click attribution in the currency it reports; spend is the ad account's. No currency conversion is applied, so a mixed-currency workspace should read ROAS per account." },
  revenue: { key: "revenue", name: "Revenue", definition: "Order or purchase value a connected tracking source attributed to your social traffic.", formula: "Σ source-reported revenue by UTM", unit: "currency", aggregation: "sum", grains: ["day"], providers: TRACKING_SOURCES, freshnessHours: 24, caveat: "Reported in the source's own currency; never converted. Missing is not zero — a source that reports no purchase value shows revenue as unavailable, not 0." },
  sessions: { key: "sessions", name: "Sessions", definition: "Visits to your site that Google Analytics attributed to a social source.", formula: "Σ GA4 sessions by sessionSource/sessionMedium", unit: "count", aggregation: "sum", grains: ["day"], providers: { ga4: "runReport sessions" }, freshnessHours: 24, caveat: "Counted by GA4's session definition, not by our link clicks; the two will not match because clicks and landed sessions are different events." },
  viewers: { key: "viewers", name: "Viewers", definition: "Accounts that viewed your media, as Meta counts it from June 2026: the media was played or displayed, not merely delivered to the feed.", formula: "Σ per-network daily media viewers", unit: "count", aggregation: "sum", grains: ["day", "post", "channel"], providers: { meta: "media viewers / page viewer metrics" }, freshnessHours: 24, unavailable: "Viewers appear once a connected Meta channel reports the metric; Meta backfills it from 1 May 2025 only, so earlier days stay empty rather than zero.", caveat: "Not comparable to Reach. Reach counted unique impressions (content entered the screen); Viewers counts unique media views (the media was rendered). Never chart, total, or compare the two as one series — read them either side of the definition break.", breaks: [metaBreak({ name: "Reach (unique impressions)", formula: "unique accounts the content entered the screen for" }, { name: "Viewers (unique media viewers)", formula: "unique accounts that viewed the media" })] },
};

/** Ratios over a totals bag; null when the denominator is missing or zero (never infinity). */
export function paidRatio(key: DisplayMetric, t: Partial<Record<string, number>>): number | null {
  const ratio = (a: number | undefined, b: number | undefined, k = 1) => (a == null || !b ? null : (a / b) * k);
  if (key === "cpm") return ratio(t.spend, t.impressions, 1000);
  if (key === "cpc") return ratio(t.spend, t.link_clicks);
  if (key === "ctr_paid") return ratio(t.link_clicks, t.impressions);
  if (key === "cpa") return ratio(t.spend, t.conversions);
  return null;
}

export const SCORECARD: DisplayMetric[] = ["reach", "engagement", "impressions", "link_clicks", "conversions", "spend", "roas"];

export function formatMetric(m: MetricContract, v: number | null) {
  if (v === null) return "—";
  if (m.unit === "percent") return `${(v * 100).toFixed(1)}%`;
  if (m.unit === "ratio") return `${v.toFixed(2)}x`;
  if (m.unit === "currency") return `$${v.toLocaleString(undefined, { maximumFractionDigits: v < 100 ? 2 : 0 })}`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 10_000) return `${(v / 1000).toFixed(1)}K`;
  return v.toLocaleString();
}
