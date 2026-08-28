/*
 * Applying a matched run: either park it behind the approval gate, or run the
 * actions and close the run. Worker-safe.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { workspaceMembership, type WorkspaceRole } from "@/db/schema/app";
import { user } from "@/db/schema/auth";
import { automationApproval, automationRule, automationRun, type ActionOutcome, type AutomationRule, type AutomationRun } from "@/db/schema/automations";
import { conversationEvent, savedReply } from "@/db/schema/engagement";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { applyActions } from "./actions";
import { loadCreator, runNeedsApproval, type Creator } from "./capabilities";
import { describeActions, type NameLookup } from "./labels";
import { resolveSubjects, type Subject } from "./facts";

const APPROVAL_DUE_HOURS = 24;

async function usersWithRoles(workspaceId: string, roles: WorkspaceRole[]) {
  if (!roles.length) return [];
  const rows = await db.select({ userId: workspaceMembership.userId }).from(workspaceMembership).where(and(eq(workspaceMembership.workspaceId, workspaceId), inArray(workspaceMembership.role, roles)));
  return rows.map((r) => r.userId);
}


/** Resolve the ids an action references so the approver reads names, not placeholders. */
async function namesFor(workspaceId: string, actions: AutomationRule["actions"]): Promise<NameLookup> {
  const replyIds: string[] = [];
  const userIds: string[] = [];
  for (const a of actions) {
    if (a.kind === "inbox.saved_reply") replyIds.push(a.savedReplyId);
    if (a.kind === "inbox.assign") userIds.push(a.userId);
    if (a.kind === "notify") userIds.push(...(a.userIds ?? []));
    if (a.kind === "publish.request_approval" && a.assigneeUserId) userIds.push(a.assigneeUserId);
  }
  const [replies, users] = await Promise.all([
    replyIds.length ? db.select({ id: savedReply.id, title: savedReply.title }).from(savedReply).where(and(eq(savedReply.workspaceId, workspaceId), inArray(savedReply.id, replyIds))) : [],
    userIds.length ? db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, userIds)) : [],
  ]);
  return { savedReplies: Object.fromEntries(replies.map((r) => [r.id, r.title])), users: Object.fromEntries(users.map((u) => [u.id, u.name])) };
}

/** Parks the run and asks the approvers to decide. The actions have not run yet. */
export async function parkForApproval(rule: AutomationRule, run: AutomationRun, subject: Subject, why: string) {
  const summary = `${describeActions(rule.actions, await namesFor(run.workspaceId, rule.actions))} — on ${subject.label}`;
  const dueAt = new Date(Date.now() + APPROVAL_DUE_HOURS * 3_600_000);
  const approvalId = await db.transaction(async (tx) => {
    const [a] = await tx
      .insert(automationApproval)
      .values({ organizationId: run.organizationId, workspaceId: run.workspaceId, runId: run.id, ruleId: rule.id, approverRoles: rule.approverRoles, summary, dueAt })
      .onConflictDoNothing()
      .returning({ id: automationApproval.id });
    if (a) await tx.update(automationRun).set({ status: "awaiting_approval", approvalId: a.id, reason: why }).where(eq(automationRun.id, run.id));
    return a?.id ?? null;
  });
  if (!approvalId) return null;
  const approvers = await usersWithRoles(run.workspaceId, rule.approverRoles);
  for (const userId of approvers.length ? approvers : [null]) {
    await notify({ workspaceId: run.workspaceId, organizationId: run.organizationId, userId, kind: "automation.approval_requested", title: `Approve automation "${rule.name}"`, body: summary, href: `/app/${run.workspaceId}/approvals?automation=${approvalId}`, email: true });
  }
  await audit({ action: "automation.awaiting_approval", actorUserId: rule.createdByUserId, organizationId: run.organizationId, workspaceId: run.workspaceId, targetType: "automation_run", targetId: run.id, summary: { note: why, after: { rule: rule.name, approvalId } } });
  return approvalId;
}

const statusFor = (outcomes: ActionOutcome[]) => {
  if (outcomes.some((o) => o.status === "failed")) return "failed" as const;
  if (outcomes.length && outcomes.every((o) => o.status === "skipped")) return "skipped" as const;
  return "applied" as const;
};

/** Runs the actions, records the outcome, and leaves a trace where the rule acted. */
export async function applyRun(rule: AutomationRule, run: AutomationRun, subject: Subject, creator: Creator | null) {
  const outcomes = await applyActions({ rule: { id: rule.id, name: rule.name }, runId: run.id, subject, creator }, rule.actions);
  const status = statusFor(outcomes);
  const reason = status === "skipped" ? outcomes.map((o) => o.detail).join("; ") : null;
  await db.transaction(async (tx) => {
    await tx.update(automationRun).set({ status, actionsResult: outcomes, reason, finishedAt: new Date() }).where(eq(automationRun.id, run.id));
    await tx.update(automationRule).set({ lastRunAt: new Date(), runCount: sql`${automationRule.runCount} + 1`, updatedAt: new Date() }).where(eq(automationRule.id, rule.id));
    // The inbox thread shows "Applied by rule <name>" so nothing looks like it happened by itself.
    if (subject.ctx.conversationId && status !== "skipped") {
      await tx.insert(conversationEvent).values({ workspaceId: run.workspaceId, conversationId: subject.ctx.conversationId, kind: "automation", data: { ruleId: rule.id, ruleName: rule.name, runId: run.id, outcomes } });
    }
  });
  await audit({ action: `automation.${status}`, actorUserId: rule.createdByUserId, organizationId: run.organizationId, workspaceId: run.workspaceId, targetType: "automation_run", targetId: run.id, result: status === "failed" ? "error" : "ok", summary: { note: subject.label, after: { rule: rule.name, outcomes } } });
  return { status, outcomes };
}

/** Decide whether to park or apply, then do it. */
export async function dispatchRun(rule: AutomationRule, run: AutomationRun, subject: Subject) {
  const creator = await loadCreator(run.workspaceId, rule.createdByUserId);
  const gate = runNeedsApproval(rule.actions, rule.requiresApproval, creator, subject.ctx);
  if (gate.needed) return { parked: await parkForApproval(rule, run, subject, gate.why) };
  return { applied: await applyRun(rule, run, subject, creator) };
}

/** Resume an approved run: rebuild the subject, then apply. Facts are re-read, never replayed from the run. */
export async function resumeRun(runId: string) {
  const run = await db.query.automationRun.findFirst({ where: (r, { eq }) => eq(r.id, runId) });
  if (!run || run.status !== "awaiting_approval") return { skipped: "run is not waiting for approval" };
  const rule = await db.query.automationRule.findFirst({ where: (r, { eq }) => eq(r.id, run.ruleId) });
  if (!rule) return { skipped: "rule was deleted" };
  const subjects = await resolveSubjects(run.triggerType, run.triggerRefId);
  const subject = subjects.find((s) => s.refId === run.triggerRefId);
  if (!subject) {
    await db.update(automationRun).set({ status: "skipped", reason: "the event this run was about no longer exists", finishedAt: new Date() }).where(eq(automationRun.id, run.id));
    return { skipped: "subject is gone" };
  }
  const creator = await loadCreator(run.workspaceId, rule.createdByUserId);
  return { applied: await applyRun(rule, run, subject, creator) };
}

/** Reject: close the run without running anything. */
export async function rejectRun(runId: string, reason: string) {
  await db.update(automationRun).set({ status: "rejected", reason, finishedAt: new Date() }).where(eq(automationRun.id, runId));
}
