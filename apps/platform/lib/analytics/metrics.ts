/*
 * Metric contract registry (analytics.md "Metric contract", ANA-002).
 * Every displayed metric resolves to one of these; the UI shows the
 * definition and freshness next to the number. Bump DEFINITIONS_VERSION
 * whenever a formula or mapping changes so exports can be compared.
 */
import type { CanonicalMetric } from "@make-it-social/providers";

export const DEFINITIONS_VERSION = "2026.08.1";

export type DisplayMetric = CanonicalMetric | "roas" | "engagement_rate" | "ctr" | "cpm" | "cpc" | "ctr_paid" | "cpa";
/** Paid-only keys; values exist only when an ad account is connected (M6). */
export const PAID_METRICS: DisplayMetric[] = ["spend", "conversions", "cpm", "cpc", "ctr_paid", "cpa", "roas"];

export type MetricContract = {
  key: DisplayMetric;
  name: string;
  definition: string;
  formula: string;
  unit: "count" | "percent" | "currency" | "ratio";
  aggregation: "sum" | "last" | "ratio";
  grains: ("day" | "post" | "channel")[];
  providers: Partial<Record<"mock" | "meta" | "linkedin" | "tiktok" | "youtube" | "pinterest" | "x", string>>;
  freshnessHours: number;
  /** Why this may be unavailable right now (paid metrics before M6, tracking not connected…). */
  unavailable?: string;
  caveat?: string;
};

const P = { mock: "mock.*", meta: "insights API", linkedin: "organizationalEntityShareStatistics", tiktok: "business insights" };
const ADS = { mock: "mock ads", meta: "Marketing API /act_{id}/insights" };
const PAID_NOTE = "Paid only: imported daily from connected ad accounts in the account currency; no currency conversion is applied.";

export const METRICS: Record<DisplayMetric, MetricContract> = {
  impressions: { key: "impressions", name: "Impressions", definition: "Times your content was displayed. Repeat views count again.", formula: "Σ provider impressions", unit: "count", aggregation: "sum", grains: ["day", "post", "channel"], providers: P, freshnessHours: 24 },
  reach: { key: "reach", name: "Reach", definition: "Accounts that saw your content at least once, per network.", formula: "Σ per-network daily reach", unit: "count", aggregation: "sum", grains: ["day", "post", "channel"], providers: P, freshnessHours: 24, caveat: "Reach is unique within a network and a day only. Totals across networks or days are additive, not deduplicated." },
  video_views: { key: "video_views", name: "Video views", definition: "Views that met the network's own threshold (e.g. 3 s on Facebook, 2 s on TikTok).", formula: "Σ provider video views", unit: "count", aggregation: "sum", grains: ["day", "post"], providers: P, freshnessHours: 24, caveat: "Thresholds differ per network; compare within a network." },
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
  conversions: { key: "conversions", name: "Conversions", definition: "Conversions the ad platform attributed to paid ads (its own model and window, shown alongside).", formula: "Σ provider-attributed conversion actions", unit: "count", aggregation: "sum", grains: ["day", "post"], providers: ADS, freshnessHours: 24, caveat: "Organic conversions need a pixel/UTM tracking source, which is not connected yet; only paid conversions are counted." },
  spend: { key: "spend", name: "Spend", definition: "Paid media spend reported by connected ad accounts.", formula: "Σ ad campaign daily spend", unit: "currency", aggregation: "sum", grains: ["day", "post"], providers: ADS, freshnessHours: 24, caveat: PAID_NOTE },
  cpm: { key: "cpm", name: "CPM", definition: "Cost per 1,000 paid impressions.", formula: "spend ÷ paid impressions × 1000", unit: "currency", aggregation: "ratio", grains: ["day"], providers: ADS, freshnessHours: 24, caveat: PAID_NOTE },
  cpc: { key: "cpc", name: "CPC", definition: "Cost per paid link click.", formula: "spend ÷ paid link clicks", unit: "currency", aggregation: "ratio", grains: ["day"], providers: ADS, freshnessHours: 24, caveat: PAID_NOTE },
  ctr_paid: { key: "ctr_paid", name: "CTR (paid)", definition: "Paid link clicks divided by paid impressions.", formula: "paid link_clicks ÷ paid impressions", unit: "percent", aggregation: "ratio", grains: ["day"], providers: ADS, freshnessHours: 24, caveat: PAID_NOTE },
  cpa: { key: "cpa", name: "Cost per result", definition: "Spend divided by provider-attributed conversions.", formula: "spend ÷ conversions", unit: "currency", aggregation: "ratio", grains: ["day"], providers: ADS, freshnessHours: 24, caveat: PAID_NOTE },
  roas: { key: "roas", name: "ROAS", definition: "Return on ad spend: attributed revenue divided by spend.", formula: "revenue ÷ spend", unit: "ratio", aggregation: "ratio", grains: ["day"], providers: {}, freshnessHours: 24, unavailable: "Ad imports carry conversion counts but not revenue. ROAS appears once a revenue source (pixel value or commerce) is connected." },
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
