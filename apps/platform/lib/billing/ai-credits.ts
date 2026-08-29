/*
 * AI credits consumed per workspace inside a billing period.
 *
 * The Settings UI reads `usageByWorkspace` from lib/ai/usage/export.ts, but
 * that module is `server-only` and the usage-reporting job runs in the worker,
 * so the same aggregate is expressed here against the same ledger table and
 * the same credit conversion. Nothing about credits is re-derived.
 */
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { workspace } from "@/db/schema/app";
import { aiUsage } from "@/db/schema/ai-usage";
import { creditsFromColumn } from "@/lib/ai/usage/credits";

export type WorkspaceCredits = { workspaceId: string; workspaceName: string; credits: number };

/** Credits by workspace for [from, to). Archived workspaces still count: they used the AI. */
export async function creditsByWorkspace(
  organizationId: string,
  period: { from: Date; to: Date },
): Promise<WorkspaceCredits[]> {
  const rows = await db
    .select({
      workspaceId: aiUsage.workspaceId,
      workspaceName: workspace.name,
      credits: sql<string>`coalesce(sum(${aiUsage.credits}), 0)`,
    })
    .from(aiUsage)
    .innerJoin(workspace, eq(workspace.id, aiUsage.workspaceId))
    .where(and(eq(aiUsage.organizationId, organizationId), gte(aiUsage.createdAt, period.from), lt(aiUsage.createdAt, period.to)))
    .groupBy(aiUsage.workspaceId, workspace.name);
  return rows.map((r) => ({ ...r, credits: creditsFromColumn(r.credits) }));
}
