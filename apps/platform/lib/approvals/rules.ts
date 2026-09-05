/*
 * Pure approval rules: who may decide, what "overdue" means, who a reminder
 * reaches, and how a due time is chosen. No I/O, so the page, the layout, the
 * worker and the tests share one definition.
 */
import type { WorkspaceRole } from "@/db/schema/app";

export type Principal = { userId: string; role: WorkspaceRole; grants: readonly string[] };
export type DecideTarget = { assigneeUserId: string | null; approverRoles: WorkspaceRole[]; separationOfDuty: boolean; requestedByUserId: string | null };

/** Can this principal decide on the request? Respects assignee + separation of duty. */
export function canDecide(p: Principal, req: DecideTarget): { ok: boolean; reason?: string } {
  if (req.separationOfDuty && req.requestedByUserId === p.userId) return { ok: false, reason: "You can't approve your own request." };
  if (req.assigneeUserId) return req.assigneeUserId === p.userId || ["owner", "admin"].includes(p.role) ? { ok: true } : { ok: false, reason: "This request is assigned to someone else." };
  if (p.role === "client_approver") return { ok: false, reason: "Client approvers can only decide requests assigned to them." };
  return req.approverRoles.includes(p.role) ? { ok: true } : { ok: false, reason: "Your role can't approve content here." };
}

/** Overdue = still waiting for a decision, and past its due time. A decided request is never overdue. */
export function isOverdue(req: { state: string; dueAt: Date | null }, now: Date = new Date()): boolean {
  return req.state === "pending" && req.dueAt !== null && req.dueAt.getTime() < now.getTime();
}

/** An overdue request concerns you when you can decide it, or you asked for it. Sidebar and Home count exactly this. */
export function concernsMe(p: Principal, req: DecideTarget): boolean {
  return canDecide(p, req).ok || req.requestedByUserId === p.userId;
}

export type Member = { userId: string; role: WorkspaceRole };

/**
 * Who the overdue reminder reaches: the assignee when there is one, otherwise
 * every member whose role may approve — minus the requester when separation of
 * duty applies, because a reminder to someone who cannot act is noise.
 */
export function reminderRecipients(req: DecideTarget, members: Member[]): string[] {
  if (req.assigneeUserId) return [req.assigneeUserId];
  return members.filter((m) => req.approverRoles.includes(m.role) && !(req.separationOfDuty && m.userId === req.requestedByUserId)).map((m) => m.userId);
}

/** Policy windows are hours; requirements say nothing about a floor, so one minute ahead is the only rule. */
export const MIN_LEAD_MS = 60_000;

/** The due time for a new request: the requester's choice when given (must be ahead of now), else the policy window. */
export function dueAtFor(input: { requested?: Date | null; policyHours?: number | null; now?: Date }): { dueAt: Date } | { error: string } {
  const now = input.now ?? new Date();
  if (input.requested) {
    if (Number.isNaN(input.requested.getTime())) return { error: "That due time is not a valid date." };
    if (input.requested.getTime() < now.getTime() + MIN_LEAD_MS) return { error: "The due time must be in the future." };
    return { dueAt: input.requested };
  }
  return { dueAt: new Date(now.getTime() + (input.policyHours ?? 24) * 3_600_000) };
}
