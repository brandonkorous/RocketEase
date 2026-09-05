"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { workspaceMembership, type WorkspaceRole } from "@/db/schema/app";
import { approvalDecision, approvalRequest, comment } from "@/db/schema/approvals";
import { contentItem, contentVersion, postVariant, type VersionSnapshot } from "@/db/schema/content";
import { canDecide, matchPolicy, submitForApprovalCore } from "@/lib/approvals";
import { dueAtFor } from "@/lib/approvals/rules";
import { audit } from "@/lib/audit";
import { track } from "@/lib/telemetry";
import { AuthorizationError } from "@/lib/authz";
import { summarizeItem, validateVariant } from "@/lib/content";
import { emit } from "@/lib/jobs/outbox";
import { notify } from "@/lib/notifications";
import { requireCapability, requireWorkspace } from "@/lib/session";
import { workspacePath } from "@/lib/nav";
import { formatInZone, zonedToUtc } from "@/lib/time";
import { scheduleItem } from "./content";

export type ActionState = { error?: string; ok?: string };
const fail = (error: string): ActionState => ({ error });
const guard = async <T>(fn: () => Promise<T>): Promise<T | ActionState> => {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AuthorizationError) return fail("You don't have permission to do that.");
    throw e;
  }
};

/* ------------------------------ Requests ------------------------------ */

/** Whether scheduling this item requires approval right now (used by the composer and scheduleItem). */
export async function approvalRequirement(workspaceId: string, itemId: string): Promise<{ required: boolean; policyName?: string; state: string; dueHours: number }> {
  const ctx = await requireWorkspace(workspaceId);
  const item = await db.query.contentItem.findFirst({ where: (c, { and, eq }) => and(eq(c.id, itemId), eq(c.workspaceId, workspaceId)) });
  if (!item) return { required: false, state: "not_required", dueHours: 24 };
  if (item.approvalState === "approved") return { required: false, state: "approved", dueHours: 24 };
  const policy = await matchPolicy({ workspaceId, itemId, authorRole: ctx.workspace.role, campaignId: item.campaignId });
  return { required: Boolean(policy), policyName: policy?.name, state: item.approvalState, dueHours: policy?.dueHours ?? 24 };
}

/** `dueAt` is "YYYY-MM-DDTHH:mm" in the workspace timezone, like `scheduleOnApprove`; empty means the policy window. */
const requestSchema = z.object({ workspaceId: z.string(), itemId: z.string(), assigneeUserId: z.string().optional().nullable(), note: z.string().max(1000).optional(), scheduleOnApprove: z.string().optional(), dueAt: z.string().optional() });

/** Freeze a version and open a request. Supersedes any pending request for the item. */
export async function requestApproval(input: z.infer<typeof requestSchema>): Promise<ActionState & { requestId?: string }> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid request");
  const { workspaceId, itemId, assigneeUserId, note, scheduleOnApprove, dueAt } = parsed.data;
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "content.edit");
    const timezone = ctx.workspace.timezone;
    const actor = { userId: ctx.session.user.id, userName: ctx.session.user.name, organizationId: ctx.workspace.organizationId, workspaceId, role: ctx.workspace.role, timezone };
    const r = await submitForApprovalCore(actor, { itemId, assigneeUserId, note, scheduleOnApprove, dueAt: dueAt ? zonedToUtc(dueAt, timezone) : null }, "action:requestApproval");
    if (r.error) return fail(r.error);
    revalidatePath(workspacePath(workspaceId, "approvals"));
    return { ok: `Sent for review. Due ${formatInZone(r.dueAt!, timezone)}.`, requestId: r.requestId };
  });
}

const dueSchema = z.object({ workspaceId: z.string(), requestId: z.string(), dueAt: z.string() });

/** Move a pending request's deadline. Reviewers and the requester may; a new deadline re-arms the one reminder. */
export async function setRequestDue(input: z.infer<typeof dueSchema>): Promise<ActionState> {
  const parsed = dueSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid due time");
  const { workspaceId, requestId } = parsed.data;
  return guard(async () => {
    const ctx = await requireWorkspace(workspaceId);
    const req = await db.query.approvalRequest.findFirst({ where: (r, { and, eq }) => and(eq(r.id, requestId), eq(r.workspaceId, workspaceId)) });
    if (!req || req.state !== "pending") return fail("Request is not pending.");
    const me = { userId: ctx.session.user.id, role: ctx.workspace.role, grants: ctx.workspace.grants };
    if (!canDecide(me, req).ok && req.requestedByUserId !== me.userId) return fail("Only a reviewer or the requester can change the due time.");
    const due = dueAtFor({ requested: zonedToUtc(parsed.data.dueAt, ctx.workspace.timezone) });
    if ("error" in due) return fail(due.error);
    await db.update(approvalRequest).set({ dueAt: due.dueAt, remindedAt: null, updatedAt: new Date() }).where(eq(approvalRequest.id, req.id));
    await audit({ action: "approval.due_changed", actorUserId: me.userId, organizationId: req.organizationId, workspaceId, targetType: "approval_request", targetId: req.id, summary: { before: { dueAt: req.dueAt?.toISOString() ?? null }, after: { dueAt: due.dueAt.toISOString() } } });
    revalidatePath(`/app/${workspaceId}`, "layout");
    return { ok: `Due ${formatInZone(due.dueAt, ctx.workspace.timezone)}.` };
  });
}

const decideSchema = z.object({ workspaceId: z.string(), requestId: z.string(), decision: z.enum(["approved", "changes_requested", "rejected"]), comment: z.string().trim().max(2000).optional() });

/** Immutable decision. Approving may auto-schedule when the request asked for it. */
export async function decideRequest(input: z.infer<typeof decideSchema>): Promise<ActionState> {
  const parsed = decideSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid decision");
  const { workspaceId, requestId, decision: kind, comment: text } = parsed.data;
  if (kind !== "approved" && !text) return fail(kind === "changes_requested" ? "Say what needs to change." : "Give a reason for rejecting.");
  return guard(async () => {
    const ctx = await requireWorkspace(workspaceId);
    const req = await db.query.approvalRequest.findFirst({ where: (r, { and, eq }) => and(eq(r.id, requestId), eq(r.workspaceId, workspaceId)) });
    if (!req) return fail("Request not found.");
    if (req.state !== "pending") return fail(`This request was already ${req.state.replace("_", " ")}.`);
    const item = await db.query.contentItem.findFirst({ where: (c, { eq }) => eq(c.id, req.contentItemId) });
    if (!item) return fail("Post not found.");
    // Stale version guard: the item moved on after the request was made.
    if (item.currentVersionId && item.currentVersionId !== req.versionId) return fail("This post changed since the request. Ask for a fresh review.");
    const gate = canDecide({ userId: ctx.session.user.id, role: ctx.workspace.role, grants: ctx.workspace.grants }, req);
    if (!gate.ok) {
      await audit({ action: "authz.deny:approvals.decide", actorUserId: ctx.session.user.id, organizationId: item.organizationId, workspaceId, targetType: "approval_request", targetId: req.id, result: "denied" });
      return fail(gate.reason ?? "Not permitted.");
    }

    await db.transaction(async (tx) => {
      await tx.insert(approvalDecision).values({ requestId: req.id, versionId: req.versionId, decidedByUserId: ctx.session.user.id, decision: kind, comment: text ?? null });
      await tx.update(approvalRequest).set({ state: kind, decidedAt: new Date(), updatedAt: new Date() }).where(eq(approvalRequest.id, req.id));
      await tx.update(contentItem).set({ approvalState: kind === "rejected" ? "changes_requested" : kind, status: kind === "approved" ? "approved" : "changes_requested", updatedAt: new Date() }).where(eq(contentItem.id, item.id));
      if (text) await tx.insert(comment).values({ organizationId: item.organizationId, workspaceId, contentItemId: item.id, versionId: req.versionId, authorUserId: ctx.session.user.id, body: text });
      await emit(tx, "automation.evaluate", { trigger: "approval.decided", refId: req.id }, { organizationId: item.organizationId, workspaceId, dedupeKey: `automation:approval:${req.id}` });
    });
    await audit({ action: `approval.${kind}`, actorUserId: ctx.session.user.id, organizationId: item.organizationId, workspaceId, targetType: "approval_request", targetId: req.id, summary: { note: text } });
    await track("approval_decided", { userId: ctx.session.user.id, organizationId: item.organizationId, workspaceId, surface: "action:decideRequest", props: { decision: kind } });
    await notify({ workspaceId, organizationId: item.organizationId, userId: req.requestedByUserId, kind: "approval.decided", title: `${item.title}: ${kind.replace("_", " ")}`, body: text ?? `${ctx.session.user.name} approved this post.`, href: workspacePath(workspaceId, `posts/${item.id}`), email: true });

    let extra = "";
    if (kind === "approved" && req.scheduleOnApprove) {
      const r = await scheduleItem({ workspaceId, itemId: item.id, when: req.scheduleOnApprove });
      extra = r.error ? ` Scheduling failed: ${r.error}` : req.scheduleOnApprove === "now" ? " Publishing now." : " Scheduled as requested.";
    }
    revalidatePath(workspacePath(workspaceId, "approvals"));
    revalidatePath(workspacePath(workspaceId, `posts/${item.id}`));
    return { ok: `${kind === "approved" ? "Approved." : kind === "changes_requested" ? "Changes requested." : "Rejected."}${extra}` };
  });
}

export async function assignRequest(workspaceId: string, requestId: string, assigneeUserId: string | null): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "approvals.decide");
    const req = await db.query.approvalRequest.findFirst({ where: (r, { and, eq }) => and(eq(r.id, requestId), eq(r.workspaceId, workspaceId)) });
    if (!req || req.state !== "pending") return fail("Request is not pending.");
    await db.update(approvalRequest).set({ assigneeUserId, updatedAt: new Date() }).where(eq(approvalRequest.id, req.id));
    await audit({ action: "approval.assign", actorUserId: ctx.session.user.id, organizationId: req.organizationId, workspaceId, targetType: "approval_request", targetId: req.id, summary: { after: { assigneeUserId } } });
    if (assigneeUserId) {
      const item = await db.query.contentItem.findFirst({ where: (c, { eq }) => eq(c.id, req.contentItemId) });
      await notify({ workspaceId, organizationId: req.organizationId, userId: assigneeUserId, kind: "approval.requested", title: `Assigned to you: ${item?.title ?? "post"}`, href: workspacePath(workspaceId, `approvals?request=${req.id}`), email: true });
    }
    revalidatePath(workspacePath(workspaceId, "approvals"));
    return { ok: "Reassigned." };
  });
}

export async function cancelRequest(workspaceId: string, requestId: string): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "content.edit");
    const req = await db.query.approvalRequest.findFirst({ where: (r, { and, eq }) => and(eq(r.id, requestId), eq(r.workspaceId, workspaceId)) });
    if (!req || req.state !== "pending") return fail("Request is not pending.");
    await db.transaction(async (tx) => {
      await tx.update(approvalRequest).set({ state: "canceled", updatedAt: new Date() }).where(eq(approvalRequest.id, req.id));
      await tx.update(contentItem).set({ approvalState: "not_required", status: "draft", updatedAt: new Date() }).where(eq(contentItem.id, req.contentItemId));
    });
    await summarizeItem(req.contentItemId);
    await audit({ action: "approval.cancel", actorUserId: ctx.session.user.id, organizationId: req.organizationId, workspaceId, targetType: "approval_request", targetId: req.id });
    revalidatePath(workspacePath(workspaceId, "approvals"));
    return { ok: "Request withdrawn." };
  });
}

/** Bulk decide: skips unauthorized/stale items, reports per item (flows.md "Destructive and bulk actions"). */
export async function bulkDecide(workspaceId: string, requestIds: string[], kind: "approved" | "rejected", text?: string): Promise<ActionState & { results?: { id: string; ok: boolean; message: string }[] }> {
  const results: { id: string; ok: boolean; message: string }[] = [];
  for (const id of requestIds.slice(0, 50)) {
    const r = await decideRequest({ workspaceId, requestId: id, decision: kind, comment: text });
    results.push({ id, ok: !r.error, message: r.error ?? r.ok ?? "" });
  }
  const okCount = results.filter((r) => r.ok).length;
  return { ok: `${okCount} of ${results.length} ${kind === "approved" ? "approved" : "rejected"}.`, results };
}

/* ------------------------------ Comments ------------------------------ */

export async function addComment(workspaceId: string, itemId: string, body: string, opts: { versionId?: string; field?: string; assetId?: string; parentId?: string } = {}): Promise<ActionState> {
  const text = body.trim();
  if (!text) return fail("Write something first.");
  if (text.length > 4000) return fail("Comment is too long.");
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "content.comment");
    const item = await db.query.contentItem.findFirst({ where: (c, { and, eq }) => and(eq(c.id, itemId), eq(c.workspaceId, workspaceId)) });
    if (!item) return fail("Post not found.");
    await db.insert(comment).values({ organizationId: item.organizationId, workspaceId, contentItemId: item.id, authorUserId: ctx.session.user.id, body: text, versionId: opts.versionId ?? item.currentVersionId, field: opts.field ?? null, assetId: opts.assetId ?? null, parentId: opts.parentId ?? null });
    // Notify the owner + pending assignee (not yourself).
    const pending = await db.query.approvalRequest.findFirst({ where: (r, { and, eq }) => and(eq(r.contentItemId, item.id), eq(r.state, "pending")) });
    for (const uid of new Set([item.ownerUserId, pending?.assigneeUserId, pending?.requestedByUserId].filter((u): u is string => Boolean(u) && u !== ctx.session.user.id)))
      await notify({ workspaceId, organizationId: item.organizationId, userId: uid, kind: "comment.added", title: `${ctx.session.user.name} commented on ${item.title}`, body: text.slice(0, 200), href: workspacePath(workspaceId, `posts/${item.id}`) });
    revalidatePath(workspacePath(workspaceId, `posts/${item.id}`));
    revalidatePath(workspacePath(workspaceId, "approvals"));
    return { ok: "Comment added." };
  });
}

export async function resolveComment(workspaceId: string, commentId: string): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "content.comment");
    const [row] = await db.update(comment).set({ resolvedAt: new Date(), resolvedByUserId: ctx.session.user.id }).where(and(eq(comment.id, commentId), eq(comment.workspaceId, workspaceId))).returning({ itemId: comment.contentItemId });
    if (!row) return fail("Comment not found.");
    revalidatePath(workspacePath(workspaceId, "approvals"));
    revalidatePath(workspacePath(workspaceId, `posts/${row.itemId}`));
    return { ok: "Resolved." };
  });
}

/** Members who can be assigned as reviewers (roles that may decide, plus client approvers). */
export async function reviewerOptions(workspaceId: string) {
  await requireWorkspace(workspaceId);
  const rows = await db.select({ userId: workspaceMembership.userId, role: workspaceMembership.role }).from(workspaceMembership).where(and(eq(workspaceMembership.workspaceId, workspaceId), inArray(workspaceMembership.role, ["owner", "admin", "manager", "client_approver"] as WorkspaceRole[])));
  return rows;
}

export { desc };
