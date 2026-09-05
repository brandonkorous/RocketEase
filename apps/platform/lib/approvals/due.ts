/*
 * Overdue approval requests: the set one person is shown (sidebar badge, Home
 * attention, agency overview), and the sweep that sends each request its ONE
 * reminder. The definitions live in ./rules; this file only reads and writes.
 */
import { and, eq, isNull, lt } from "drizzle-orm";
import { db } from "@/db";
import { workspace, workspaceMembership } from "@/db/schema/app";
import { approvalRequest } from "@/db/schema/approvals";
import { user } from "@/db/schema/auth";
import { contentItem } from "@/db/schema/content";
import { workspacePath } from "@/lib/nav";
import { notify } from "@/lib/notifications";
import { formatInZone } from "@/lib/time";
import { concernsMe, reminderRecipients, type Principal } from "./rules";

export type OverdueRow = { id: string; itemId: string; title: string; dueAt: Date; requestedByUserId: string | null; assigneeUserId: string | null };

/** Pending requests past due that concern this person: ones they can decide, or ones they asked for. */
export async function overdueRequestsFor(workspaceId: string, me: Principal, now = new Date()): Promise<OverdueRow[]> {
  const rows = await db
    .select({ r: approvalRequest, title: contentItem.title })
    .from(approvalRequest)
    .innerJoin(contentItem, eq(contentItem.id, approvalRequest.contentItemId))
    .where(and(eq(approvalRequest.workspaceId, workspaceId), eq(approvalRequest.state, "pending"), lt(approvalRequest.dueAt, now), isNull(contentItem.deletedAt)))
    .orderBy(approvalRequest.dueAt);
  return rows.filter(({ r }) => concernsMe(me, r)).map(({ r, title }) => ({ id: r.id, itemId: r.contentItemId, title, dueAt: r.dueAt!, requestedByUserId: r.requestedByUserId, assigneeUserId: r.assigneeUserId }));
}

/**
 * The reminder sweep. Each newly overdue request is CLAIMED by stamping
 * `reminded_at` before anything is sent, so two workers (or a retry) cannot
 * both remind. Returns how many requests were reminded this pass.
 */
export async function sweepOverdueApprovals(now = new Date()): Promise<number> {
  const due = await db
    .select({ r: approvalRequest, title: contentItem.title, requester: user.name, timezone: workspace.timezone })
    .from(approvalRequest)
    .innerJoin(contentItem, eq(contentItem.id, approvalRequest.contentItemId))
    .innerJoin(workspace, eq(workspace.id, approvalRequest.workspaceId))
    .leftJoin(user, eq(user.id, approvalRequest.requestedByUserId))
    .where(and(eq(approvalRequest.state, "pending"), lt(approvalRequest.dueAt, now), isNull(approvalRequest.remindedAt), isNull(contentItem.deletedAt)));
  let reminded = 0;
  for (const row of due) {
    const claimed = await db.update(approvalRequest).set({ remindedAt: now }).where(and(eq(approvalRequest.id, row.r.id), isNull(approvalRequest.remindedAt))).returning({ id: approvalRequest.id });
    if (claimed.length === 0) continue;
    const members = await db.select({ userId: workspaceMembership.userId, role: workspaceMembership.role }).from(workspaceMembership).where(eq(workspaceMembership.workspaceId, row.r.workspaceId));
    const body = `Due ${formatInZone(row.r.dueAt!, row.timezone)}. ${row.requester ?? "Someone"} is waiting on a decision.`;
    for (const uid of reminderRecipients(row.r, members)) {
      await notify({ workspaceId: row.r.workspaceId, organizationId: row.r.organizationId, userId: uid, kind: "approval.overdue", title: `Review overdue: ${row.title}`, body, href: workspacePath(row.r.workspaceId, `approvals?request=${row.r.id}`), email: true });
    }
    reminded++;
  }
  return reminded;
}
