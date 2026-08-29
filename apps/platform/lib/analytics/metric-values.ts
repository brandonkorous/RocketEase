/*
 * One metric value with everything needed to trust it: definition version,
 * formula, caveat, dated definition changes, and — when it cannot be shown —
 * the reason. Missing is never zero (analytics.md).
 *
 * Shared by the analytics screen and the public API so both answer identically.
 */
import type { ReportFilters } from "@/db/schema/analytics";
import { conversionState, type ConversionState } from "@/lib/tracking/conversions";
import { trackingUnavailable } from "@/lib/tracking/availability";
import { definitionChangeNotes } from "./breaks";
import { derived } from "./derive";
import { DEFINITIONS_VERSION, METRICS, PAID_METRICS, formatMetric, type DisplayMetric, type MetricContract } from "./metrics";
import { freshness, totals, type Period, type Totals } from "./queries";

const NO_PAID = "No paid data in this period. Connect an ad account from a campaign's Ads tab to import spend and conversions.";
const NO_DATA = "No insights ingested yet.";

export type AvailabilityContext = { conversions: ConversionState; paid: Totals; hasData: boolean };

/**
 * Why a metric cannot be shown, or null. Tracking-supplied metrics answer for
 * themselves; everything else falls through to the paid/organic rule.
 */
export function unavailableReason(key: DisplayMetric, ctx: AvailabilityContext): string | null {
  const tracking = trackingUnavailable(key, ctx.conversions, ctx.paid);
  if (tracking !== undefined) return tracking;
  const contract = METRICS[key];
  if (contract.unavailable) return contract.unavailable;
  if (PAID_METRICS.includes(key) && ctx.paid.spend == null) return NO_PAID;
  return ctx.hasData ? null : NO_DATA;
}

export type MetricValue = {
  metric: DisplayMetric;
  name: string;
  value: number | null;
  formatted: string;
  unit: MetricContract["unit"];
  definition: string;
  formula: string;
  sources: string[];
  caveat: string | null;
  /** Dated provider definition changes inside the period; a series is never stitched across one. */
  definitionChanges: string[];
  /** Null when the value is real; otherwise the exact reason it is missing. */
  unavailable: string | null;
};

export type MetricsResponse = {
  definitionsVersion: string;
  period: Period;
  freshAt: string | null;
  stale: { name: string; network: string; reason: string | null }[];
  values: MetricValue[];
};

/** Everything the API and the scorecard need for one period, in one pass. */
export async function metricValues(workspaceId: string, keys: DisplayMetric[], filters: ReportFilters, period: Period): Promise<MetricsResponse> {
  const [cur, paid, conversions, fresh] = await Promise.all([
    totals(workspaceId, filters, period),
    filters.scope === "organic" ? Promise.resolve<Totals>({}) : totals(workspaceId, { ...filters, scope: "paid" }, period),
    conversionState(workspaceId),
    freshness(workspaceId),
  ]);
  const hasData = Object.keys(cur).length > 0;
  const values = keys.map<MetricValue>((key) => {
    const contract = METRICS[key];
    const unavailable = unavailableReason(key, { conversions, paid, hasData });
    // ROAS divides paid revenue by paid spend, so it never reads the selected-scope bag.
    const value = unavailable ? null : derived(key, key === "roas" ? paid : cur);
    return {
      metric: key,
      name: contract.name,
      value,
      formatted: formatMetric(contract, value),
      unit: contract.unit,
      definition: contract.definition,
      formula: contract.formula,
      sources: Object.values(contract.providers),
      caveat: contract.caveat ?? null,
      definitionChanges: definitionChangeNotes(period.from, period.to, [key]),
      unavailable,
    };
  });
  return {
    definitionsVersion: DEFINITIONS_VERSION,
    period,
    freshAt: fresh.latestAt ? fresh.latestAt.toISOString() : null,
    stale: fresh.staleChannels.map((s) => ({ name: s.name, network: s.network, reason: s.lastError })),
    values,
  };
}
