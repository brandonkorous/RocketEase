/*
 * Insights contract. Adapters return raw daily facts with provider-native
 * metric keys mapped onto the canonical names in the platform's metric
 * registry; the platform owns aggregation, comparison and freshness.
 */
export type CanonicalMetric =
  | "impressions"
  | "reach"
  /**
   * Meta's successor to reach from June 2026: unique accounts that VIEWED the
   * media, not unique accounts the content was delivered to. A separate metric
   * on purpose — the two must never be summed or charted as one series.
   */
  | "viewers"
  | "video_views"
  | "reactions"
  | "comments"
  | "shares"
  | "saves"
  | "engagement"
  | "link_clicks"
  | "followers"
  | "follower_gain"
  | "watch_time_minutes"
  /** Paid-only (scope = paid); imported from ad accounts. */
  | "spend"
  | "conversions";

export type InsightFact = {
  /** "channel" for account-level series, "post" for a remote publication. */
  entity: "channel" | "post";
  /** Remote post id when entity = post; omitted for channel facts. */
  remoteId?: string;
  metric: CanonicalMetric;
  /** Calendar day in the provider's reporting timezone (YYYY-MM-DD). */
  day: string;
  value: number;
  /** Provider metric name this value came from (provenance). */
  source: string;
};

export type InsightsRequest = {
  /** Inclusive day range, YYYY-MM-DD. */
  since: string;
  until: string;
  /** Remote post ids to fetch post-level facts for (published in the window or shortly before). */
  postRemoteIds?: string[];
};

export type InsightsPage = {
  facts: InsightFact[];
  /** Provider-side timezone the days are bucketed in. */
  timezone?: string;
  /**
   * Provider metric names the API rejected as no longer valid for this object.
   * The rest of the page is still good — surfaced so the platform can say which
   * numbers are missing and why, instead of showing an empty chart.
   */
  unsupportedMetrics?: string[];
};
