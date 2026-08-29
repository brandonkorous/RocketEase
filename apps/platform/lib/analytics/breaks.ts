/*
 * Definition breaks: dates on which a provider changed what a metric counts
 * (analytics.md "Metric contract"; docs/research/trends-2026.md §1).
 * Pure module — client components, the worker and the CSV export all use it.
 * Rule: a series is never stitched across a break. Charts split, exports name it.
 */
import { METRICS, type DisplayMetric, type MetricBreak, type ProviderKey } from "./metrics";

export const PROVIDER_LABEL: Record<ProviderKey, string> = {
  mock: "Mock", meta: "Meta", linkedin: "LinkedIn", tiktok: "TikTok", youtube: "YouTube",
  pinterest: "Pinterest", x: "X", google_business: "Google Business Profile", ga4: "Google Analytics", shopify: "Shopify", webhook: "Webhook",
};

/** Networks a provider key covers, for scoping a break to a workspace's channels. */
export const PROVIDER_NETWORKS: Partial<Record<ProviderKey, string[]>> = {
  meta: ["facebook", "instagram"], linkedin: ["linkedin"], tiktok: ["tiktok"],
  youtube: ["youtube"], pinterest: ["pinterest"], x: ["x"], google_business: ["google_business"], mock: ["mock"],
};

export type BreakPoint = {
  metric: DisplayMetric;
  metricName: string;
  entry: MetricBreak;
  /** Chart annotation, e.g. "Definition changed — Meta". */
  label: string;
  tooltip: string;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** A day string is valid only if it round-trips: rejects 2026-02-31 and friends. */
export const isValidDay = (d: string) => DAY.test(d) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;

export const breakLabel = (b: MetricBreak) => `Definition changed — ${PROVIDER_LABEL[b.provider]}`;

const tooltipOf = (metricName: string, b: MetricBreak) =>
  `${metricName}: ${PROVIDER_LABEL[b.provider]} changed this metric on ${b.effectiveFrom}. Before: ${b.previous.name} (${b.previous.formula}). From then: ${b.next.name} (${b.next.formula}). ${b.note}`;

const point = (metric: DisplayMetric, entry: MetricBreak): BreakPoint => {
  const metricName = METRICS[metric].name;
  return { metric, metricName, entry, label: breakLabel(entry), tooltip: tooltipOf(metricName, entry) };
};

/** Every break declared anywhere in the registry, oldest first. */
export function allBreaks(): BreakPoint[] {
  const out = Object.values(METRICS).flatMap((m) => (m.breaks ?? []).map((b) => point(m.key, b)));
  return out.sort((a, z) => a.entry.effectiveFrom.localeCompare(z.entry.effectiveFrom));
}

/**
 * Breaks that fall inside a day range and therefore split it. A break on the
 * first day is not a split: every day in the range is already the new definition.
 */
export function breaksInRange(from: string, to: string, metrics?: DisplayMetric[]): BreakPoint[] {
  const keep = metrics ? new Set<DisplayMetric>(metrics) : null;
  return allBreaks().filter((p) => (!keep || keep.has(p.metric)) && p.entry.effectiveFrom > from && p.entry.effectiveFrom <= to);
}

export type BreakMarker = BreakPoint & { day: string; index: number };

/**
 * Markers for one metric over the observed days of a series. The marker sits on
 * the first observed day at or after the break, so gaps in the data still split.
 */
export function seriesBreakMarkers(metric: DisplayMetric, days: string[]): BreakMarker[] {
  if (days.length < 2) return [];
  const sorted = [...days].sort();
  const markers: BreakMarker[] = [];
  for (const p of breaksInRange(sorted[0], sorted[sorted.length - 1], [metric])) {
    const index = sorted.findIndex((d) => d >= p.entry.effectiveFrom);
    if (index > 0) markers.push({ ...p, day: sorted[index], index });
  }
  return markers;
}

/** Split sorted days into runs that each sit wholly on one side of every break. */
export function splitAtBreaks(days: string[], markers: BreakMarker[]): string[][] {
  const cuts = [...new Set(markers.map((m) => m.index))].sort((a, z) => a - z);
  const runs: string[][] = [];
  let start = 0;
  for (const c of cuts) {
    if (c > start) runs.push(days.slice(start, c));
    start = c;
  }
  runs.push(days.slice(start));
  return runs.filter((r) => r.length > 0);
}

/** One sentence per break, for the CSV header and the report definitions section. */
export function definitionChangeNotes(from: string, to: string, metrics?: DisplayMetric[]): string[] {
  return breaksInRange(from, to, metrics).map(
    (p) => `${p.metricName} (${PROVIDER_LABEL[p.entry.provider]}), ${p.entry.effectiveFrom}: ${p.entry.previous.name} → ${p.entry.next.name}. ${p.entry.note}`,
  );
}
