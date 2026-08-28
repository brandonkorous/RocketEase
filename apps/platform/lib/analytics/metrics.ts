/*
 * Metric contract registry (analytics.md "Metric contract", ANA-002).
 * Every displayed metric resolves to one of these; the UI shows the
 * definition and freshness next to the number. Bump DEFINITIONS_VERSION
 * whenever a formula or mapping changes so exports can be compared.
 */
import type { CanonicalMetric } from "@make-it-social/providers";

export const DEFINITIONS_VERSION = "2026.08.1";

export type DisplayMetric = CanonicalMetric | "conversions" | "spend" | "roas" | "engagement_rate" | "ctr";

export type MetricContract = {
  key: DisplayMetric;
  name: string;
  definition: string;
  formula: string;
  unit: "count" | "percent" | "currency" | "ratio";
  aggregation: "sum" | "last" | "ratio";
  grains: ("day" | "post" | "channel")[];
  providers: Partial<Record<"mock" | "meta" | "linkedin" | "tiktok", string>>;
  freshnessHours: number;
  /** Why this may be unavailable right now (paid metrics before M6, tracking not connected…). */
  unavailable?: string;
  caveat?: string;
};

const P = { mock: "mock.*", meta: "insights API", linkedin: "organizationalEntityShareStatistics", tiktok: "business insights" };

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
  follower_gain: { key: "follower_gain", name: "Net follower growth", definition: "New followers minus unfollows.", formula: "Σ daily net change", unit: "count", aggregation: "sum", grains: ["day", "channel"], providers: P, freshnessHours: 24 },
  engagement_rate: { key: "engagement_rate", name: "Engagement rate", definition: "Engagement divided by reach.", formula: "engagement ÷ reach", unit: "percent", aggregation: "ratio", grains: ["day", "post", "channel"], providers: P, freshnessHours: 24, caveat: "Denominator is reach, not followers." },
  ctr: { key: "ctr", name: "Click-through rate", definition: "Link clicks divided by impressions.", formula: "link_clicks ÷ impressions", unit: "percent", aggregation: "ratio", grains: ["day", "post", "channel"], providers: P, freshnessHours: 24 },
  conversions: { key: "conversions", name: "Conversions", definition: "Tracked conversions attributed to social traffic.", formula: "Σ conversions from connected tracking (pixel/UTM)", unit: "count", aggregation: "sum", grains: ["day"], providers: {}, freshnessHours: 24, unavailable: "No conversion tracking is connected yet. Connect a pixel or UTM source in Settings → Tracking." },
  spend: { key: "spend", name: "Spend", definition: "Paid media spend in the workspace currency.", formula: "Σ ad account spend", unit: "currency", aggregation: "sum", grains: ["day"], providers: { meta: "Marketing API" }, freshnessHours: 24, unavailable: "Ad accounts are not imported yet (arrives with Campaigns & Ads)." },
  roas: { key: "roas", name: "ROAS", definition: "Return on ad spend: attributed revenue divided by spend.", formula: "revenue ÷ spend", unit: "ratio", aggregation: "ratio", grains: ["day"], providers: {}, freshnessHours: 24, unavailable: "Needs both ad spend and conversion revenue." },
};

export const SCORECARD: DisplayMetric[] = ["reach", "engagement", "impressions", "link_clicks", "conversions", "spend", "roas"];

export function formatMetric(m: MetricContract, v: number | null) {
  if (v === null) return "—";
  if (m.unit === "percent") return `${(v * 100).toFixed(1)}%`;
  if (m.unit === "ratio") return `${v.toFixed(2)}x`;
  if (m.unit === "currency") return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 10_000) return `${(v / 1000).toFixed(1)}K`;
  return v.toLocaleString();
}
