/*
 * Assemble a branded report document from stored facts only.
 * Worker-safe (no next/headers, no server-only): the report job runs this.
 */
import type { ReportFilters } from "@/db/schema/analytics";
import { derived } from "@/lib/analytics/derive";
import { METRICS, PAID_METRICS, SCORECARD, formatMetric } from "@/lib/analytics/metrics";
import { comparisonPeriod, delta, periodLabel } from "@/lib/analytics/periods";
import { channelMix, freshness, revisedFactsInPeriod, seriesByNetwork, topPosts, totals, type Totals } from "@/lib/analytics/queries";
import { conversionState, type ConversionState } from "@/lib/tracking/conversions";
import { trackingUnavailable } from "@/lib/tracking/availability";
import { formatInZone } from "@/lib/time";
import { log } from "@/lib/log";
import { loadBranding, logoDataUri, parseClientBrand } from "./branding";
import { buildAppendix, inboxSection, insightsSection, paidSection } from "./build-parts";
import type { PostRow, ReportBrand, ReportDocument, ScoreRow } from "./document";

export type ReportWorkspace = { id: string; name: string; timezone: string; organizationId: string; settings: Record<string, unknown> };
export type BuildInput = { workspace: ReportWorkspace; filters: ReportFilters; title: string };

const SCOPE_LABEL: Record<ReportFilters["scope"], string> = { all: "Organic and paid", organic: "Organic only", paid: "Paid only" };

/** A tracking store that is unreachable must not fail a whole report; the conversion metrics then say what is missing. */
const NO_CONVERSIONS: ConversionState = { sources: [], healthy: 0, total: 0, hasRevenue: false, currencies: [], lastSyncAt: null };
const safeConversionState = (workspaceId: string) =>
  conversionState(workspaceId).catch((err) => {
    log.warn("conversion state unavailable", { workspaceId, err: String(err) });
    return NO_CONVERSIONS;
  });

/** Agency brand by default; the client's own when the agency turned that on for this workspace. */
export async function resolveBrand(ws: ReportWorkspace): Promise<ReportBrand> {
  const branding = await loadBranding(ws.organizationId);
  const client = parseClientBrand(ws.settings);
  const usesClientBrand = branding.clientBrand[ws.id] === true;
  const [agencyLogo, clientLogo] = await Promise.all([logoDataUri(usesClientBrand ? null : branding.logoKey), logoDataUri(client.logoKey)]);
  return {
    agencyName: branding.agencyName,
    agencyLogo,
    clientName: client.displayName || ws.name,
    clientLogo,
    footerText: branding.footerText,
    usesClientBrand,
  };
}

function scorecardRows(cur: Totals, prev: Totals, paid: Totals, hasData: boolean, compared: boolean, conversions: ConversionState): ScoreRow[] {
  return SCORECARD.map((key) => {
    const m = METRICS[key];
    // Conversion metrics answer for themselves from the tracking sources; the rest keep the paid/organic rule.
    const tracking = trackingUnavailable(key, conversions, paid);
    const unavailable = tracking !== undefined ? tracking : (m.unavailable ?? (PAID_METRICS.includes(key) && paid.spend == null ? "No paid data in this period." : hasData ? null : "No insights ingested yet."));
    const value = unavailable ? null : derived(key, key === "roas" ? paid : cur);
    const previous = unavailable || !compared || key === "roas" ? null : derived(key, prev);
    const d = delta(value, previous);
    return {
      name: m.name,
      definition: m.definition,
      formula: m.formula,
      value: unavailable ? "—" : formatMetric(m, value),
      previous: previous === null ? null : formatMetric(m, previous),
      deltaLabel: d ? d.label : null,
      unavailable,
    };
  });
}

const postRows = (rows: Awaited<ReturnType<typeof topPosts>>, tz: string): PostRow[] =>
  rows.map((p) => ({
    title: p.title || "Untitled post",
    network: p.network,
    channelName: p.channelName,
    publishedAt: formatInZone(p.publishedAt, tz, { dateStyle: "medium" }),
    url: p.url,
    reach: formatMetric(METRICS.reach, p.reach),
    engagement: formatMetric(METRICS.engagement, p.engagement),
    clicks: formatMetric(METRICS.link_clicks, p.clicks),
  }));

export async function buildReportDocument({ workspace: ws, filters, title }: BuildInput): Promise<ReportDocument> {
  const tz = ws.timezone;
  const cmp = comparisonPeriod(filters);
  const [brand, cur, prev, paid, trend, mix, top, fresh, revised, inbox, insights] = await Promise.all([
    resolveBrand(ws),
    totals(ws.id, filters, filters),
    cmp ? totals(ws.id, filters, cmp) : Promise.resolve<Totals>({}),
    filters.scope === "organic" ? Promise.resolve<Totals>({}) : totals(ws.id, { ...filters, scope: "paid" }, filters),
    seriesByNetwork(ws.id, filters, filters, "engagement"),
    channelMix(ws.id, filters, filters),
    topPosts(ws.id, filters, filters, "engagement", 8),
    freshness(ws.id),
    revisedFactsInPeriod(ws.id, filters),
    inboxSection(ws.id),
    insightsSection(ws.id),
  ]);
  const [paidPart, conversions] = await Promise.all([paidSection(ws.id, tz, paid), safeConversionState(ws.id)]);
  const hasData = Object.keys(cur).length > 0;
  const mixTotal = mix.reduce((s, m) => s + m.value, 0);
  return {
    brand,
    meta: {
      title,
      periodLabel: periodLabel(filters),
      comparisonLabel: cmp ? periodLabel(cmp) : null,
      generatedAt: formatInZone(new Date(), tz),
      timezone: tz,
      scopeLabel: SCOPE_LABEL[filters.scope],
      channelLabel: filters.channelId ? mix.find((m) => m.channelId === filters.channelId)?.name ?? "One channel" : "All connected channels",
    },
    scorecard: scorecardRows(cur, prev, paid, hasData, Boolean(cmp), conversions),
    trend,
    trendMetric: METRICS.engagement.name,
    mix: mix.map((m) => ({ name: m.name, network: m.network, value: m.value, share: mixTotal ? `${((m.value / mixTotal) * 100).toFixed(1)}%` : "—" })),
    mixTotal,
    topPosts: postRows(top, tz),
    inbox,
    paid: paidPart,
    insights,
    appendix: buildAppendix({ tz, fresh, revised, filters, hasPaid: Boolean(paidPart) }),
  };
}
