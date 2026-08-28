/*
 * The shape a branded report renders from. Everything here is already a
 * formatted, sourced fact: the renderer never computes or invents a number,
 * and every figure that cannot be sourced arrives as `unavailable` text
 * (analytics.md "Metric contract": missing is not zero).
 */
import type { SeriesPoint } from "@/lib/analytics/queries";

export type ReportBrand = {
  agencyName: string;
  agencyLogo: string | null;
  clientName: string;
  clientLogo: string | null;
  footerText: string;
  /** True when the client's own brand replaces the agency's on the cover. */
  usesClientBrand: boolean;
};

export type ScoreRow = {
  name: string;
  definition: string;
  formula: string;
  value: string;
  previous: string | null;
  deltaLabel: string | null;
  unavailable: string | null;
};

export type MixRow = { name: string; network: string; value: number; share: string };
export type PostRow = { title: string; network: string; channelName: string; publishedAt: string; url: string | null; reach: string; engagement: string; clicks: string };
export type InboxRow = { label: string; value: string; note: string };
export type PaidSection = { attribution: { model: string; window: string; sources: string; currency: string; freshLabel: string | null }; rows: InboxRow[] };
export type InsightRow = { title: string; body: string; confidence: string };

export type AppendixMetric = { name: string; definition: string; formula: string; unit: string; sources: string; freshness: string; caveat: string | null };

export type ReportAppendix = {
  definitionsVersion: string;
  metrics: AppendixMetric[];
  sources: string[];
  freshnessLabel: string;
  staleSources: string[];
  caveats: string[];
  revisionNote: string | null;
};

export type ReportDocument = {
  brand: ReportBrand;
  meta: {
    title: string;
    periodLabel: string;
    comparisonLabel: string | null;
    generatedAt: string;
    timezone: string;
    scopeLabel: string;
    channelLabel: string;
  };
  scorecard: ScoreRow[];
  trend: SeriesPoint[];
  trendMetric: string;
  mix: MixRow[];
  mixTotal: number;
  topPosts: PostRow[];
  inbox: InboxRow[] | null;
  paid: PaidSection | null;
  insights: InsightRow[];
  appendix: ReportAppendix;
};

export type RollupClient = {
  name: string;
  timezone: string;
  periodLabel: string;
  rows: InboxRow[];
  /** Per-workspace only; analytics.md forbids combined currency totals across clients. */
  spend: string | null;
  note: string | null;
};

export type RollupDocument = {
  brand: ReportBrand;
  meta: { title: string; periodLabel: string; generatedAt: string; scopeLabel: string };
  clients: RollupClient[];
  appendix: ReportAppendix;
};
