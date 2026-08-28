import type { ReportFilters } from "@/db/schema/analytics";
import { DEFINITIONS_VERSION, METRICS, type DisplayMetric } from "./metrics";
import { comparisonPeriod } from "./periods";
import { freshness, seriesByNetwork, topPosts, totals } from "./queries";

const esc = (v: unknown) => { const s = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const row = (cells: unknown[]) => cells.map(esc).join(",");
const TOTAL_KEYS: DisplayMetric[] = ["reach", "impressions", "engagement", "link_clicks", "followers", "follower_gain"];

/**
 * CSV export (ANA-003): header block records generation time, filters,
 * definitions version and source freshness so the file is self-describing.
 */
export async function buildCsv(input: { workspaceId: string; workspaceName: string; timezone: string; filters: ReportFilters; generatedBy: string }): Promise<string> {
  const { workspaceId, filters } = input;
  const cmp = comparisonPeriod(filters);
  const [cur, prev, fresh, trend, top] = await Promise.all([
    totals(workspaceId, filters, filters),
    cmp ? totals(workspaceId, filters, cmp) : Promise.resolve({}),
    freshness(workspaceId),
    seriesByNetwork(workspaceId, filters, filters, "engagement"),
    topPosts(workspaceId, filters, filters, "engagement", 25),
  ]);
  const lines: string[] = [];
  lines.push(`# Make It Social analytics export`);
  lines.push(`# workspace,${esc(input.workspaceName)},${workspaceId}`);
  lines.push(`# generated_at,${new Date().toISOString()},by,${esc(input.generatedBy)}`);
  lines.push(`# period,${filters.from},${filters.to},timezone,${input.timezone}`);
  lines.push(`# comparison,${cmp ? `${cmp.from},${cmp.to}` : "none"}`);
  lines.push(`# filters,channel=${filters.channelId ?? "all"},campaign=${filters.campaignId ?? "all"},scope=${filters.scope}`);
  lines.push(`# definitions_version,${DEFINITIONS_VERSION}`);
  lines.push(`# source_freshness,${fresh.latestAt?.toISOString() ?? "none"},degraded_sources,${fresh.staleChannels.length}`);
  lines.push("");
  lines.push(row(["section", "metric", "definition", "formula", "unit", "current", "previous", "change_abs"]));
  for (const k of TOTAL_KEYS) {
    const m = METRICS[k];
    const c = (cur as Record<string, number>)[k] ?? null;
    const p = (prev as Record<string, number>)[k] ?? null;
    lines.push(row(["totals", m.name, m.definition, m.formula, m.unit, c, p, c !== null && p !== null ? c - p : null]));
  }
  for (const k of ["conversions", "spend", "roas"] as const) lines.push(row(["totals", METRICS[k].name, METRICS[k].definition, METRICS[k].formula, METRICS[k].unit, "unavailable", "unavailable", METRICS[k].unavailable]));
  lines.push("");
  lines.push(row(["section", "day", "network", "engagement"]));
  for (const p of trend) lines.push(row(["trend", p.day, p.network, p.value]));
  lines.push("");
  lines.push(row(["section", "post", "network", "channel", "published_at", "url", "reach", "engagement", "link_clicks"]));
  for (const p of top) lines.push(row(["top_posts", p.title, p.network, p.channelName, p.publishedAt.toISOString(), p.url, p.reach, p.engagement, p.clicks]));
  return lines.join("\n") + "\n";
}
