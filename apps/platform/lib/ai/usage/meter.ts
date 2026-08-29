/*
 * Reading the ledger. Every "how much AI has this workspace used" question is
 * answered here, over the workspace's own calendar month.
 */
import "server-only";
import { and, eq, gte, lt, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { workspace } from "@/db/schema/app";
import { aiUsage, type AiUsageKind } from "@/db/schema/ai-usage";
import { budgetFrom, readAiLimits, type AiBudget, type AiLimits } from "./budget";
import { creditsFromColumn } from "./credits";
import { currentMonthWindow, type MonthWindow } from "./period";

export { aiCapMessage, allowanceFor, capFor, readAiLimits, type AiBudget, type AiLimits } from "./budget";

export type KindUsage = { kind: AiUsageKind; requests: number; credits: number };
export type MonthlyUsage = {
  month: string;
  timezone: string;
  from: Date;
  to: Date;
  resetsAt: Date;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  credits: number;
  /** Null when no model in the period had a configured price. */
  costUsd: number | null;
  byKind: KindUsage[];
};
export type AiUsageSummary = MonthlyUsage & { limits: AiLimits; budget: AiBudget };

const inWindow = (workspaceId: string, w: MonthWindow): SQL =>
  and(eq(aiUsage.workspaceId, workspaceId), gte(aiUsage.createdAt, w.from), lt(aiUsage.createdAt, w.to))!;

/** The workspace's month and plan limits. A missing workspace reads as UTC defaults. */
async function context(workspaceId: string): Promise<{ timezone: string; limits: AiLimits; window: MonthWindow }> {
  const [ws] = await db.select({ timezone: workspace.timezone, settings: workspace.settings }).from(workspace).where(eq(workspace.id, workspaceId));
  const timezone = ws?.timezone ?? "UTC";
  return { timezone, limits: readAiLimits(ws?.settings), window: currentMonthWindow(timezone) };
}

async function usedCredits(workspaceId: string, w: MonthWindow): Promise<number> {
  const [row] = await db.select({ credits: sql<string>`coalesce(sum(${aiUsage.credits}), 0)` }).from(aiUsage).where(inWindow(workspaceId, w));
  return creditsFromColumn(row?.credits);
}

/** The whole month: totals plus the per-kind breakdown the meter renders. */
export async function monthlyUsage(workspaceId: string): Promise<MonthlyUsage> {
  const { timezone, window } = await context(workspaceId);
  const [totals, kinds] = await Promise.all([monthTotals(workspaceId, window), monthByKind(workspaceId, window)]);
  return { month: window.month, timezone, from: window.from, to: window.to, resetsAt: window.resetsAt, ...totals, byKind: kinds };
}

async function monthTotals(workspaceId: string, w: MonthWindow) {
  const [row] = await db
    .select({
      requests: sql<number>`count(*)::int`,
      inputTokens: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)::int`,
      credits: sql<string>`coalesce(sum(${aiUsage.credits}), 0)`,
      costUsd: sql<string | null>`sum(${aiUsage.costUsd})`,
    })
    .from(aiUsage)
    .where(inWindow(workspaceId, w));
  return {
    requests: row?.requests ?? 0,
    inputTokens: row?.inputTokens ?? 0,
    outputTokens: row?.outputTokens ?? 0,
    credits: creditsFromColumn(row?.credits),
    costUsd: row?.costUsd == null ? null : Number(row.costUsd),
  };
}

async function monthByKind(workspaceId: string, w: MonthWindow): Promise<KindUsage[]> {
  const rows = await db
    .select({ kind: aiUsage.kind, requests: sql<number>`count(*)::int`, credits: sql<string>`coalesce(sum(${aiUsage.credits}), 0)` })
    .from(aiUsage)
    .where(inWindow(workspaceId, w))
    .groupBy(aiUsage.kind);
  return rows.map((r) => ({ kind: r.kind, requests: r.requests, credits: creditsFromColumn(r.credits) })).sort((a, b) => b.credits - a.credits);
}

/** The spend gate `generate()` consults. One indexed aggregate, no breakdown. */
export async function checkAiBudget(workspaceId: string): Promise<AiBudget> {
  const { timezone, limits, window } = await context(workspaceId);
  const used = await usedCredits(workspaceId, window);
  return budgetFrom({ used, limits, resetsAt: window.resetsAt, timezone });
}

/** Everything a usage meter renders, in one round trip. */
export async function aiUsageSummary(workspaceId: string): Promise<AiUsageSummary> {
  const { timezone, limits, window } = await context(workspaceId);
  const [totals, byKind] = await Promise.all([monthTotals(workspaceId, window), monthByKind(workspaceId, window)]);
  const budget = budgetFrom({ used: totals.credits, limits, resetsAt: window.resetsAt, timezone });
  return { month: window.month, timezone, from: window.from, to: window.to, resetsAt: window.resetsAt, ...totals, byKind, limits, budget };
}
