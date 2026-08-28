/*
 * Paid contract (integrations.md "Ads", requirements CAM-001/CAM-002).
 * Imports are READ-ONLY. The only spend-changing call is `promote`, and the
 * platform must never invoke it without an explicit user confirmation.
 * Amounts are major units of the ad account's currency (12.50 = $12.50).
 */

export type AdAccountStatus = "active" | "disabled" | "unsettled" | "closed" | "unknown";

export type AdAccountDescriptor = {
  /** Provider account id without prefixes (Meta: the numeric act id). */
  remoteId: string;
  name: string;
  /** ISO 4217. Every fact and budget for this account is in this currency. */
  currency: string;
  timezone?: string;
  status: AdAccountStatus;
  /** Deep link to the provider's native manager. */
  managerUrl?: string;
};

export type PaidObjectStatus = "active" | "paused" | "in_review" | "rejected" | "archived" | "deleted" | "unknown";

export type AdCampaignFact = {
  remoteId: string;
  name: string;
  objective?: string;
  status: PaidObjectStatus;
  dailyBudget?: number;
  lifetimeBudget?: number;
  startAt?: string;
  endAt?: string;
  managerUrl?: string;
};

export type AdSetFact = {
  remoteId: string;
  campaignRemoteId: string;
  name: string;
  status: PaidObjectStatus;
  dailyBudget?: number;
  lifetimeBudget?: number;
  /** Human-readable targeting ("US, CA · 25–44") — never the raw spec. */
  targetingSummary?: string;
  startAt?: string;
  endAt?: string;
};

export type AdCreativeFact = {
  remoteId: string;
  adSetRemoteId: string;
  campaignRemoteId: string;
  name: string;
  status: PaidObjectStatus;
  /** Organic post this ad boosts, when the provider exposes it. */
  promotedPostRemoteId?: string;
  previewUrl?: string;
  thumbnailUrl?: string;
};

export type PaidObjects = { campaigns: AdCampaignFact[]; adSets: AdSetFact[]; ads: AdCreativeFact[] };

/** Canonical paid metrics; ratios (CPM, CPC, CTR, CPA, ROAS) are derived by the platform. */
export type PaidMetric = "spend" | "impressions" | "reach" | "link_clicks" | "conversions" | "video_views" | "engagement";

export type PaidInsightFact = {
  entity: "campaign" | "ad";
  remoteId: string;
  metric: PaidMetric;
  day: string;
  value: number;
  currency: string;
  /** Provider field the value came from (provenance). */
  source: string;
};

export type PaidInsightsRequest = { since: string; until: string; levels?: ("campaign" | "ad")[] };

export type PaidInsightsPage = {
  facts: PaidInsightFact[];
  currency: string;
  timezone?: string;
  /** How the provider attributed conversions; shown next to every conversion number. */
  attribution?: { model: string; window: string };
};

export type PromotionBudget = { kind: "daily" | "lifetime"; amount: number; currency: string };

export type PromotionRequest = {
  /** Stable key; the same key must never create a second set of remote objects. */
  idempotencyKey: string;
  name: string;
  objective: "engagement" | "traffic" | "awareness" | "leads" | "conversions";
  /** Organic post being boosted, on the given channel. */
  sourcePostRemoteId: string;
  channelRemoteId: string;
  budget: PromotionBudget;
  startAt: string;
  endAt?: string;
  audience?: { countries?: string[]; ageMin?: number; ageMax?: number };
  link?: string;
  tracking?: { utmSource?: string; utmMedium?: string; utmCampaign?: string };
  /** Remote objects are created paused unless the user explicitly asked to go live. */
  initialStatus: "paused" | "active";
};

export type PromotionResult = {
  campaignRemoteId: string;
  adSetRemoteId: string;
  adRemoteId: string;
  status: PaidObjectStatus;
  managerUrl?: string;
  createdAt: string;
};
