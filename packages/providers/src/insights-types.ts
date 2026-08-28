/*
 * Insights contract. Adapters return raw daily facts with provider-native
 * metric keys mapped onto the canonical names in the platform's metric
 * registry; the platform owns aggregation, comparison and freshness.
 */
export type CanonicalMetric =
  | "impressions"
  | "reach"
  | "video_views"
  | "reactions"
  | "comments"
  | "shares"
  | "saves"
  | "engagement"
  | "link_clicks"
  | "followers"
  | "follower_gain";

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

export type InsightsPage = { facts: InsightFact[]; /** Provider-side timezone the days are bucketed in. */ timezone?: string };
