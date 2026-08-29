/*
 * Section builders for the branded report. Each one returns already-formatted
 * strings with their provenance, or null when the workspace has no such facts
 * — nothing is estimated or filled in.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { inboxSettings } from "@/db/schema/engagement";
import type { ReportFilters } from "@/db/schema/analytics";
import { DEFINITIONS_VERSION, METRICS, formatMetric, type DisplayMetric } from "@/lib/analytics/metrics";
import { definitionChangeNotes } from "@/lib/analytics/breaks";
import type { Freshness, Totals } from "@/lib/analytics/queries";
import { inboxStats } from "@/lib/engagement/queries";
import { paidAttribution } from "@/lib/campaigns/attribution";
import { listRecommendations } from "@/lib/recommendations/store";
import { formatInZone } from "@/lib/time";
import type { InboxRow, InsightRow, PaidSection, ReportAppendix } from "./document";

const APPENDIX_KEYS: DisplayMetric[] = ["reach", "viewers", "impressions", "engagement", "engagement_rate", "link_clicks", "followers", "follower_gain", "spend", "conversions", "roas"];

/** Service metrics from the shared inbox (analytics.md "Service"). */
export async function inboxSection(workspaceId: string): Promise<InboxRow[] | null> {
  const stats = await inboxStats(workspaceId, "");
  const [settings] = await db.select({ target: inboxSettings.firstResponseTargetMinutes }).from(inboxSettings).where(eq(inboxSettings.workspaceId, workspaceId));
  const target = settings?.target ?? null;
  if (stats.unresolved === 0 && stats.resolvedThisWeek === 0 && stats.avgFirstResponseMinutes === null) return null;
  return [
    { label: "Unresolved conversations", value: String(stats.unresolved), note: "Open or snoozed right now, all channels." },
    { label: "Past first-response target", value: String(stats.overdue), note: target ? `Target is ${target} minutes from first inbound message.` : "No response target set." },
    { label: "Average first response", value: stats.avgFirstResponseMinutes === null ? "Not enough data" : `${stats.avgFirstResponseMinutes} min`, note: "Conversations first answered in the last 7 days." },
    { label: "Resolved in the last 7 days", value: String(stats.resolvedThisWeek), note: "Marked resolved by the team." },
  ];
}

/** Paid summary; null when no ad account is connected — never a zero. */
export async function paidSection(workspaceId: string, tz: string, paid: Totals): Promise<PaidSection | null> {
  const attribution = await paidAttribution(workspaceId, tz);
  if (!attribution || paid.spend == null) return null;
  const row = (key: DisplayMetric, note: string): InboxRow => ({ label: METRICS[key].name, value: formatMetric(METRICS[key], paid[key as keyof Totals] ?? null), note });
  const rows: InboxRow[] = [
    row("spend", `Reported by the ad account in ${attribution.currency}. No currency conversion is applied.`),
    row("impressions", "Paid impressions only."),
    row("link_clicks", "Paid link clicks only."),
    { label: METRICS.conversions.name, value: formatMetric(METRICS.conversions, paid.conversions ?? null), note: `${attribution.model}, ${attribution.window}.` },
    { label: METRICS.roas.name, value: "Unavailable", note: METRICS.roas.unavailable! },
  ];
  return { attribution: { model: attribution.model, window: attribution.window, sources: attribution.sources.join(", "), currency: attribution.currency, freshLabel: attribution.freshLabel }, rows };
}

/** Stored recommendations, when the nightly pass produced any. */
export async function insightsSection(workspaceId: string): Promise<InsightRow[]> {
  const rows = await listRecommendations(workspaceId, { limit: 5 });
  return rows.map((r) => ({ title: r.title, body: r.body, confidence: `${r.confidence} confidence` }));
}

export type AppendixInput = {
  tz: string;
  fresh: Freshness;
  revised: { count: number; from: string | null; to: string | null };
  filters: ReportFilters;
  hasPaid: boolean;
};

/** Definitions, sources, freshness and caveats — the contract that makes the numbers checkable. */
export function buildAppendix(input: AppendixInput): ReportAppendix {
  const { fresh, revised, tz } = input;
  const metrics = APPENDIX_KEYS.map((k) => {
    const m = METRICS[k];
    return { name: m.name, definition: m.definition, formula: m.formula, unit: m.unit, sources: Object.values(m.providers).join(", ") || "Not connected", freshness: `Expected within ${m.freshnessHours} h`, caveat: m.caveat ?? m.unavailable ?? null };
  });
  const caveats = [
    METRICS.reach.caveat!,
    METRICS.followers.caveat!,
    "Comparisons use the workspace timezone; a partial period is labelled as such.",
    input.hasPaid ? "Paid figures are the ad account's own attribution model and currency; organic and paid are never merged into one conversion number." : "No paid data is included: no ad account is connected for this period.",
  ];
  return {
    definitionsVersion: DEFINITIONS_VERSION,
    metrics,
    sources: [...new Set(metrics.flatMap((m) => m.sources.split(", ")))].filter((s) => s && s !== "Not connected"),
    freshnessLabel: fresh.latestAt ? formatInZone(fresh.latestAt, tz) : "No successful sync recorded",
    staleSources: fresh.staleChannels.map((c) => `${c.name} (${c.network})${c.lastError ? ` — ${c.lastError}` : ""}`),
    caveats,
    definitionChanges: definitionChangeNotes(input.filters.from, input.filters.to, APPENDIX_KEYS),
    revisionNote: revised.count > 0 ? `${revised.count} stored fact${revised.count === 1 ? "" : "s"} between ${revised.from} and ${revised.to} were revised by the provider in the last 24 hours; earlier copies of this report may differ.` : null,
  };
}
