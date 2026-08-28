/*
 * Read models for Settings → Automations and the Approvals queue.
 * Every query degrades to empty if the tables are not migrated yet, so the
 * rest of Settings keeps rendering.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { workspaceMembership, type WorkspaceRole } from "@/db/schema/app";
import { user } from "@/db/schema/auth";
import { automationApproval, automationRule, automationRun, type ActionOutcome, type ConditionGroup, type RuleAction, type RunStatus, type TriggerConfig, type TriggerKind } from "@/db/schema/automations";
import { channel } from "@/db/schema/connections";
import { savedReply } from "@/db/schema/engagement";
import { formatInZone } from "@/lib/time";
import { describeActions, type NameLookup } from "./labels";

export type RuleRow = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  trigger: TriggerKind;
  triggerConfig: TriggerConfig;
  conditions: ConditionGroup;
  actions: RuleAction[];
  actionSummary: string;
  requiresApproval: boolean;
  approverRoles: WorkspaceRole[];
  createdBy: string | null;
  lastRun: string | null;
  runCount: number;
};

export type RunRow = { id: string; ruleId: string; status: RunStatus; explanation: string; outcomes: ActionOutcome[]; reason: string | null; at: string };
export type MemberOption = { userId: string; name: string; role: WorkspaceRole };
export type AutomationOptions = { members: MemberOption[]; savedReplies: { id: string; title: string }[]; channels: { id: string; name: string; network: string }[] };
export type AutomationsData = { rules: RuleRow[]; runs: RunRow[]; options: AutomationOptions };

const EMPTY_OPTIONS: AutomationOptions = { members: [], savedReplies: [], channels: [] };
export const EMPTY_AUTOMATIONS: AutomationsData = { rules: [], runs: [], options: EMPTY_OPTIONS };

/** The tables land with the automations migration; until then Settings shows an empty state. */
async function tolerate<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export async function automationOptions(workspaceId: string): Promise<AutomationOptions> {
  const [members, replies, channels] = await Promise.all([
    db.select({ userId: workspaceMembership.userId, name: user.name, role: workspaceMembership.role }).from(workspaceMembership).innerJoin(user, eq(user.id, workspaceMembership.userId)).where(eq(workspaceMembership.workspaceId, workspaceId)).orderBy(user.name),
    db.select({ id: savedReply.id, title: savedReply.title }).from(savedReply).where(eq(savedReply.workspaceId, workspaceId)).orderBy(savedReply.title),
    db.select({ id: channel.id, name: channel.name, network: channel.network }).from(channel).where(and(eq(channel.workspaceId, workspaceId), inArray(channel.status, ["healthy", "degraded", "syncing", "action_required"]))).orderBy(channel.name),
  ]);
  return { members, savedReplies: replies, channels };
}

const RUN_LIMIT = 120;

/** Everything the Automations settings section renders. */
export async function automationsData(workspaceId: string, timezone: string): Promise<AutomationsData> {
  const options = await tolerate(() => automationOptions(workspaceId), EMPTY_OPTIONS);
  const names: NameLookup = {
    users: Object.fromEntries(options.members.map((m) => [m.userId, m.name])),
    savedReplies: Object.fromEntries(options.savedReplies.map((r) => [r.id, r.title])),
  };
  const rows = await tolerate(
    () => db.select({ r: automationRule, by: user.name }).from(automationRule).leftJoin(user, eq(user.id, automationRule.createdByUserId)).where(eq(automationRule.workspaceId, workspaceId)).orderBy(automationRule.createdAt),
    [] as { r: typeof automationRule.$inferSelect; by: string | null }[],
  );
  const at = (d: Date) => formatInZone(d, timezone, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const rules: RuleRow[] = rows.map(({ r, by }) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    enabled: r.enabled,
    trigger: r.trigger,
    triggerConfig: r.triggerConfig,
    conditions: r.conditions,
    actions: r.actions,
    actionSummary: describeActions(r.actions, names) || "No actions yet",
    requiresApproval: r.requiresApproval,
    approverRoles: r.approverRoles,
    createdBy: by,
    lastRun: r.lastRunAt ? at(r.lastRunAt) : null,
    runCount: r.runCount,
  }));
  const runRows = rules.length
    ? await tolerate(() => db.select().from(automationRun).where(eq(automationRun.workspaceId, workspaceId)).orderBy(desc(automationRun.createdAt)).limit(RUN_LIMIT), [] as (typeof automationRun.$inferSelect)[])
    : [];
  const runs: RunRow[] = runRows.map((r) => ({ id: r.id, ruleId: r.ruleId, status: r.status, explanation: r.evaluation?.explanation ?? "", outcomes: r.actionsResult, reason: r.reason, at: at(r.createdAt) }));
  return { rules, runs, options };
}

export type AutomationApprovalRow = { id: string; runId: string; ruleName: string; summary: string; explanation: string; requestedAt: string; dueLabel: string | null; overdue: boolean; canDecide: boolean };

/** Pending automation gates for the Approvals queue. */
export async function pendingAutomationApprovals(workspaceId: string, timezone: string, principal: { role: WorkspaceRole }): Promise<AutomationApprovalRow[]> {
  return tolerate(async () => {
    const rows = await db
      .select({ a: automationApproval, ruleName: automationRule.name, run: automationRun })
      .from(automationApproval)
      .innerJoin(automationRule, eq(automationRule.id, automationApproval.ruleId))
      .innerJoin(automationRun, eq(automationRun.id, automationApproval.runId))
      .where(and(eq(automationApproval.workspaceId, workspaceId), eq(automationApproval.state, "pending")))
      .orderBy(desc(automationApproval.createdAt))
      .limit(50);
    const fmt = (d: Date) => formatInZone(d, timezone, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    return rows.map(({ a, ruleName, run }) => ({
      id: a.id,
      runId: a.runId,
      ruleName,
      summary: a.summary,
      explanation: run.evaluation?.explanation ?? "",
      requestedAt: fmt(a.createdAt),
      dueLabel: a.dueAt ? fmt(a.dueAt) : null,
      overdue: Boolean(a.dueAt && a.dueAt < new Date()),
      canDecide: a.approverRoles.includes(principal.role),
    }));
  }, [] as AutomationApprovalRow[]);
}
