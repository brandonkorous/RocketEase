import type { ReportFilters } from "@/db/schema/analytics";
import { DEFINITIONS_VERSION, METRICS, type DisplayMetric } from "./metrics";
import { comparisonPeriod } from "./periods";
import { definitionChangeNotes } from "./breaks";
import { freshness, revisedFactsInPeriod, seriesByNetwork, topPosts, totals, type Totals } from "./queries";
import { derived } from "./derive";
import { conversionState, type ConversionState } from "@/lib/tracking/conversions";
import { trackingUnavailable } from "@/lib/tracking/availability";

const esc = (v: unknown) => { const s = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const row = (cells: unknown[]) => cells.map(esc).join(",");
const TOTAL_KEYS: DisplayMetric[] = ["reach", "impressions", "engagement", "link_clicks", "followers", "follower_gain"];


/** Conversion/revenue/spend/ROAS rows plus their provenance. Missing is never written as zero. */
function conversionLines(cur: Totals, paid: Totals, conversions: ConversionState): string[] {
  const out = ["conversions", "revenue", "spend", "roas"].map((key) => {
    const k = key as DisplayMetric;
    const m = METRICS[k];
    const why = trackingUnavailable(k, conversions, paid) ?? (k === "spend" && paid.spend == null ? "No paid data in this period." : null);
    const v = why ? "unavailable" : (derived(k, k === "roas" ? paid : cur) ?? "unavailable");
    return row(["totals", m.name, m.definition, m.formula, m.unit, v, "", why ?? ""]);
  });
  if (conversions.total) out.push(`# conversion_sources,${esc(conversions.sources.map((s) => `${s.name} (${s.kindLabel}, ${s.status})`).join("; "))},model,UTM last-click (source-reported),last_sync,${conversions.lastSyncAt?.toISOString() ?? "never"}`);
  return out;
}

/**
 * CSV export (ANA-003): header block records generation time, filters,
 * definitions version and source freshness so the file is self-describing.
 */
export async function buildCsv(input: { workspaceId: string; workspaceName: string; timezone: string; filters: ReportFilters; generatedBy: string }): Promise<string> {
  const { workspaceId, filters } = input;
  const cmp = comparisonPeriod(filters);
  const [cur, prev, fresh, trend, top, revised, paid, conversions] = await Promise.all([
    totals(workspaceId, filters, filters),
    cmp ? totals(workspaceId, filters, cmp) : Promise.resolve({}),
    freshness(workspaceId),
    seriesByNetwork(workspaceId, filters, filters, "engagement"),
    topPosts(workspaceId, filters, filters, "engagement", 25),
    revisedFactsInPeriod(workspaceId, filters),
    totals(workspaceId, { ...filters, scope: "paid" }, filters) as Promise<Totals>,
    conversionState(workspaceId),
  ]);
  const lines: string[] = [];
  lines.push(`# RocketEase analytics export`);
  lines.push(`# workspace,${esc(input.workspaceName)},${workspaceId}`);
  lines.push(`# generated_at,${new Date().toISOString()},by,${esc(input.generatedBy)}`);
  lines.push(`# period,${filters.from},${filters.to},timezone,${input.timezone}`);
  lines.push(`# comparison,${cmp ? `${cmp.from},${cmp.to}` : "none"}`);
  lines.push(`# filters,channel=${filters.channelId ?? "all"},campaign=${filters.campaignId ?? "all"},scope=${filters.scope}`);
  lines.push(`# definitions_version,${DEFINITIONS_VERSION}`);
  lines.push(`# source_freshness,${fresh.latestAt?.toISOString() ?? "none"},degraded_sources,${fresh.staleChannels.length}`);
  // Materially changed report: facts in this period were revised since the previous run (analytics.md "Data quality").
  if (revised.count > 0) lines.push(`# revisions_since_last_run,${revised.count},from,${revised.from},to,${revised.to}`);
  // A provider redefined a metric inside this range: the two halves are different measurements.
  const changes = definitionChangeNotes(filters.from, filters.to, [...TOTAL_KEYS, "video_views", "viewers"]);
  lines.push(`# definition_changes_in_this_range,${changes.length}`);
  for (const c of changes) lines.push(`# definition_change,${esc(c)}`);
  lines.push("");
  lines.push(row(["section", "metric", "definition", "formula", "unit", "current", "previous", "change_abs"]));
  for (const k of TOTAL_KEYS) {
    const m = METRICS[k];
    const c = (cur as Record<string, number>)[k] ?? null;
    const p = (prev as Record<string, number>)[k] ?? null;
    lines.push(row(["totals", m.name, m.definition, m.formula, m.unit, c, p, c !== null && p !== null ? c - p : null]));
  }
  lines.push(...conversionLines(cur, paid, conversions));
  lines.push("");
  lines.push(row(["section", "day", "network", "engagement"]));
  for (const p of trend) lines.push(row(["trend", p.day, p.network, p.value]));
  lines.push("");
  lines.push(row(["section", "post", "network", "channel", "published_at", "url", "reach", "engagement", "link_clicks"]));
  for (const p of top) lines.push(row(["top_posts", p.title, p.network, p.channelName, p.publishedAt.toISOString(), p.url, p.reach, p.engagement, p.clicks]));
  return lines.join("\n") + "\n";
}
