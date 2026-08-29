/*
 * Usage for a period: the line items an invoice cites and the agency roll-up.
 * Read-only, organization-scoped — the caller has already proved membership.
 */
import "server-only";
import { and, asc, eq, gte, lt, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { workspace } from "@/db/schema/app";
import { aiUsage, type AiUsageKind } from "@/db/schema/ai-usage";
import { creditsFromColumn } from "./credits";
import type { UsagePeriod } from "./period";

export type AiUsageExportRow = {
  id: string;
  workspaceId: string;
  workspaceName: string;
  userId: string | null;
  kind: AiUsageKind;
  model: string;
  inputTokens: number;
  outputTokens: number;
  credits: number;
  costUsd: number | null;
  requestId: string | null;
  createdAt: Date;
};

export type WorkspaceUsage = {
  workspaceId: string;
  workspaceName: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  credits: number;
  /** Null when nothing in the period had a configured price. */
  costUsd: number | null;
};

const inPeriod = (organizationId: string, period: UsagePeriod, workspaceId?: string): SQL =>
  and(
    eq(aiUsage.organizationId, organizationId),
    gte(aiUsage.createdAt, period.from),
    lt(aiUsage.createdAt, period.to),
    workspaceId ? eq(aiUsage.workspaceId, workspaceId) : undefined,
  )!;

/** Every ledger row in the period, oldest first. `limit` guards a runaway export. */
export async function usageRows(
  scope: { organizationId: string; workspaceId?: string },
  period: UsagePeriod,
  limit = 50_000,
): Promise<AiUsageExportRow[]> {
  const rows = await db
    .select({
      id: aiUsage.id,
      workspaceId: aiUsage.workspaceId,
      workspaceName: workspace.name,
      userId: aiUsage.userId,
      kind: aiUsage.kind,
      model: aiUsage.model,
      inputTokens: aiUsage.inputTokens,
      outputTokens: aiUsage.outputTokens,
      credits: aiUsage.credits,
      costUsd: aiUsage.costUsd,
      requestId: aiUsage.requestId,
      createdAt: aiUsage.createdAt,
    })
    .from(aiUsage)
    .innerJoin(workspace, eq(workspace.id, aiUsage.workspaceId))
    .where(inPeriod(scope.organizationId, period, scope.workspaceId))
    .orderBy(asc(aiUsage.createdAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, credits: creditsFromColumn(r.credits), costUsd: r.costUsd == null ? null : Number(r.costUsd) }));
}

/** Per-workspace totals for the period — the agency roll-up and invoice summary. */
export async function usageByWorkspace(organizationId: string, period: UsagePeriod): Promise<WorkspaceUsage[]> {
  const rows = await db
    .select({
      workspaceId: aiUsage.workspaceId,
      workspaceName: workspace.name,
      requests: sql<number>`count(*)::int`,
      inputTokens: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)::int`,
      credits: sql<string>`coalesce(sum(${aiUsage.credits}), 0)`,
      costUsd: sql<string | null>`sum(${aiUsage.costUsd})`,
    })
    .from(aiUsage)
    .innerJoin(workspace, eq(workspace.id, aiUsage.workspaceId))
    .where(inPeriod(organizationId, period))
    .groupBy(aiUsage.workspaceId, workspace.name);
  return rows
    .map((r) => ({ ...r, credits: creditsFromColumn(r.credits), costUsd: r.costUsd == null ? null : Number(r.costUsd) }))
    .sort((a, b) => b.credits - a.credits || a.workspaceName.localeCompare(b.workspaceName));
}
