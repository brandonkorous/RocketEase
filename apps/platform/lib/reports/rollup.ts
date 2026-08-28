/*
 * Agency roll-up: one document, one section per client workspace.
 *
 * analytics.md "Agency overview": per-workspace health and directional
 * metrics, never misleading combined currency totals. There is deliberately no
 * cross-client aggregate anywhere in this file.
 */
import { and, count, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { workspace } from "@/db/schema/app";
import type { ReportFilters } from "@/db/schema/analytics";
import { channel } from "@/db/schema/connections";
import { conversation } from "@/db/schema/engagement";
import { postVariant, remotePublication } from "@/db/schema/content";
import { engagementOf } from "@/lib/analytics/derive";
import { METRICS, formatMetric } from "@/lib/analytics/metrics";
import { periodLabel } from "@/lib/analytics/periods";
import { freshness, totals } from "@/lib/analytics/queries";
import { paidAttribution } from "@/lib/campaigns/attribution";
import { formatInZone } from "@/lib/time";
import { resolveBrand } from "./build";
import { buildAppendix } from "./build-parts";
import type { RollupClient, RollupDocument } from "./document";

export type RollupWorkspace = { id: string; name: string; timezone: string; organizationId: string; settings: Record<string, unknown> };

async function publishedCount(workspaceId: string, from: string, to: string) {
  const [row] = await db
    .select({ n: count() })
    .from(remotePublication)
    .innerJoin(channel, eq(channel.id, remotePublication.channelId))
    .innerJoin(postVariant, eq(postVariant.id, remotePublication.variantId))
    .where(and(eq(channel.workspaceId, workspaceId), eq(remotePublication.state, "published"), gte(remotePublication.publishedAt, new Date(`${from}T00:00:00Z`)), lte(remotePublication.publishedAt, new Date(`${to}T23:59:59Z`))));
  return Number(row?.n ?? 0);
}

async function unresolvedCount(workspaceId: string) {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(conversation).where(and(eq(conversation.workspaceId, workspaceId), ne(conversation.status, "resolved")));
  return Number(row?.n ?? 0);
}

/** One client's directional pulse. Every value is sourced; nothing is estimated. */
export async function clientPulse(ws: RollupWorkspace, filters: ReportFilters): Promise<RollupClient> {
  const [cur, paid, posts, unresolved, attribution] = await Promise.all([
    totals(ws.id, filters, filters),
    totals(ws.id, { ...filters, scope: "paid" }, filters),
    publishedCount(ws.id, filters.from, filters.to),
    unresolvedCount(ws.id),
    paidAttribution(ws.id, ws.timezone),
  ]);
  const engagement = engagementOf(cur);
  const hasData = Object.keys(cur).length > 0;
  return {
    name: ws.name,
    timezone: ws.timezone,
    periodLabel: periodLabel(filters),
    rows: [
      { label: "Posts published", value: String(posts), note: "Confirmed publications on connected channels in this period." },
      { label: METRICS.engagement.name, value: engagement == null ? "—" : formatMetric(METRICS.engagement, engagement), note: hasData ? METRICS.engagement.definition : "No insights ingested for this workspace yet." },
      { label: METRICS.reach.name, value: cur.reach == null ? "—" : formatMetric(METRICS.reach, cur.reach), note: METRICS.reach.caveat! },
      { label: "Unresolved conversations", value: String(unresolved), note: "Open or snoozed in the shared inbox right now." },
    ],
    spend: paid.spend == null || !attribution ? null : `${formatMetric(METRICS.spend, paid.spend)} ${attribution.currency}`,
    note: attribution ? `Paid attribution: ${attribution.model}, ${attribution.window}.` : null,
  };
}

export async function buildRollupDocument(input: { organizationId: string; organizationName: string; workspaces: RollupWorkspace[]; filters: ReportFilters; title: string; timezone: string }): Promise<RollupDocument> {
  const brandSource: RollupWorkspace = input.workspaces[0] ?? { id: "", name: input.organizationName, timezone: input.timezone, organizationId: input.organizationId, settings: {} };
  const [brand, clients, fresh] = await Promise.all([
    resolveBrand({ ...brandSource, id: "", name: input.organizationName, settings: {} }),
    Promise.all(input.workspaces.map((w) => clientPulse(w, input.filters))),
    input.workspaces[0] ? freshness(input.workspaces[0].id) : Promise.resolve({ latestAt: null, staleChannels: [] }),
  ]);
  return {
    brand: { ...brand, clientName: input.organizationName, clientLogo: null, usesClientBrand: false },
    meta: { title: input.title, periodLabel: periodLabel(input.filters), generatedAt: formatInZone(new Date(), input.timezone), scopeLabel: "Organic and paid, per client workspace" },
    clients,
    appendix: buildAppendix({ tz: input.timezone, fresh, revised: { count: 0, from: null, to: null }, filters: input.filters, hasPaid: clients.some((c) => c.spend) }),
  };
}

/** Workspaces the user may include, loaded with the settings the renderer needs. */
export async function rollupWorkspaces(ids: string[]): Promise<RollupWorkspace[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: workspace.id, name: workspace.name, timezone: workspace.timezone, organizationId: workspace.organizationId, settings: workspace.settings })
    .from(workspace)
    .where(inArray(workspace.id, ids))
    .orderBy(workspace.name);
  return rows;
}
