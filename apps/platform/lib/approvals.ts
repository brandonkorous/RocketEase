/*
 * Approval policy evaluation, the decision gate, and the submit core shared by
 * server actions, the worker, and the public API. Nothing reaches a network
 * without passing through here first.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { approvalPolicy, approvalRequest, type ApprovalPolicy } from "@/db/schema/approvals";
import { contentItem, contentVersion, postVariant, type VersionSnapshot } from "@/db/schema/content";
import type { WorkspaceRole } from "@/db/schema/app";
import { audit } from "@/lib/audit";
import { track } from "@/lib/telemetry";
import { validateVariant } from "@/lib/content";
import { notify } from "@/lib/notifications";
import { workspacePath } from "@/lib/nav";
import { formatInZone } from "@/lib/time";
import { dueAtFor } from "./approvals/rules";

export { canDecide } from "./approvals/rules";

/**
 * Does this item need approval under the workspace's enabled policies?
 * Returns the first matching policy (most specific wins by rule count).
 */
export async function matchPolicy(input: { workspaceId: string; itemId: string; authorRole: WorkspaceRole; campaignId?: string | null; riskLabels?: string[]; paidSpend?: boolean }): Promise<ApprovalPolicy | null> {
  const policies = await db.select().from(approvalPolicy).where(and(eq(approvalPolicy.workspaceId, input.workspaceId), eq(approvalPolicy.enabled, true)));
  if (policies.length === 0) return null;
  const channelIds = (await db.select({ channelId: postVariant.channelId }).from(postVariant).where(eq(postVariant.contentItemId, input.itemId))).map((r) => r.channelId);

  const matches = policies
    .map((p) => {
      const r = p.rule;
      let specificity = 0;
      if (r.channelIds?.length) {
        if (!channelIds.some((c) => r.channelIds!.includes(c))) return null;
        specificity++;
      }
      if (r.authorRoles?.length) {
        if (!r.authorRoles.includes(input.authorRole)) return null;
        specificity++;
      }
      if (r.campaignIds?.length) {
        if (!input.campaignId || !r.campaignIds.includes(input.campaignId)) return null;
        specificity++;
      }
      if (r.paidSpend) {
        if (!input.paidSpend) return null;
        specificity++;
      }
      if (r.riskLabels?.length) {
        if (!input.riskLabels?.some((l) => r.riskLabels!.includes(l))) return null;
        specificity++;
      }
      return { p, specificity };
    })
    .filter((m): m is { p: ApprovalPolicy; specificity: number } => Boolean(m))
    .sort((a, b) => b.specificity - a.specificity);
  return matches[0]?.p ?? null;
}

/** `timezone` only shapes the "Due …" wording in the request notice; storage is UTC either way. */
export type SubmitActor = { userId: string; userName: string; organizationId: string; workspaceId: string; role: WorkspaceRole; timezone?: string };
/** `dueAt` is the requester's deadline; absent, the policy window (default 24 h) decides. */
export type SubmitInput = { itemId: string; assigneeUserId?: string | null; note?: string | null; scheduleOnApprove?: string | null; dueAt?: Date | null };
export type SubmitResult = { error?: string; requestId?: string; policyName?: string | null; dueAt?: Date };

/**
 * Freeze a version and open an approval request, superseding any pending one.
 * The caller has already checked `content.edit`; validation errors block the
 * request so a reviewer never sees an unpublishable post.
 */
export async function submitForApprovalCore(actor: SubmitActor, input: SubmitInput, surface: string): Promise<SubmitResult> {
  const item = await db.query.contentItem.findFirst({ where: (c, { and, eq, isNull }) => and(eq(c.id, input.itemId), eq(c.workspaceId, actor.workspaceId), isNull(c.deletedAt)) });
  if (!item) return { error: "Post not found." };
  const variants = await db.select().from(postVariant).where(eq(postVariant.contentItemId, item.id));
  if (!variants.length) return { error: "Choose at least one channel first." };
  for (const v of variants) {
    const err = (await validateVariant(item, v)).issues.find((i) => i.severity === "error");
    if (err) return { error: `Fix validation first: ${err.message}` };
  }
  const policy = await matchPolicy({ workspaceId: actor.workspaceId, itemId: item.id, authorRole: actor.role, campaignId: item.campaignId });
  if (input.assigneeUserId) {
    const m = await db.query.workspaceMembership.findFirst({ where: (x, { and, eq }) => and(eq(x.workspaceId, actor.workspaceId), eq(x.userId, input.assigneeUserId!)) });
    if (!m) return { error: "That reviewer isn't a member of this workspace." };
  }
  const due = dueAtFor({ requested: input.dueAt, policyHours: policy?.dueHours });
  if ("error" in due) return { error: due.error };
  const dueAt = due.dueAt;

  const requestId = await db.transaction(async (tx) => {
    await tx.update(approvalRequest).set({ state: "superseded", updatedAt: new Date() }).where(and(eq(approvalRequest.contentItemId, item.id), eq(approvalRequest.state, "pending")));
    const [{ max }] = await tx.select({ max: sql<number>`coalesce(max(${contentVersion.number}), 0)` }).from(contentVersion).where(eq(contentVersion.contentItemId, item.id));
    const snapshot: VersionSnapshot = { title: item.title, sharedText: item.sharedText, sharedAssetIds: item.sharedAssetIds, link: item.link, variants: variants.map((v) => ({ channelId: v.channelId, format: v.format, textOverride: v.textOverride, assetIdsOverride: v.assetIdsOverride, firstComment: v.firstComment, linkOverride: v.linkOverride, settings: v.settings, scheduledAt: v.scheduledAt?.toISOString() ?? null })) };
    const [ver] = await tx.insert(contentVersion).values({ contentItemId: item.id, number: Number(max) + 1, snapshot, reason: "approval_request", createdByUserId: actor.userId }).returning({ id: contentVersion.id });
    const [req] = await tx
      .insert(approvalRequest)
      .values({ organizationId: item.organizationId, workspaceId: actor.workspaceId, contentItemId: item.id, versionId: ver.id, policyId: policy?.id ?? null, requestedByUserId: actor.userId, assigneeUserId: input.assigneeUserId ?? null, approverRoles: policy?.approverRoles ?? ["owner", "admin", "manager"], separationOfDuty: policy?.separationOfDuty ?? true, dueAt, scheduleOnApprove: input.scheduleOnApprove ?? null, note: input.note ?? null })
      .returning({ id: approvalRequest.id });
    await tx.update(contentItem).set({ approvalState: "pending", status: "in_review", currentVersionId: ver.id, updatedAt: new Date() }).where(eq(contentItem.id, item.id));
    return req.id;
  });

  await audit({ action: "approval.request", actorUserId: actor.userId, organizationId: item.organizationId, workspaceId: actor.workspaceId, targetType: "approval_request", targetId: requestId, summary: { after: { itemId: item.id, assigneeUserId: input.assigneeUserId, policy: policy?.name, dueAt: dueAt.toISOString(), surface } } });
  await track("approval_requested", { userId: actor.userId, organizationId: item.organizationId, workspaceId: actor.workspaceId, surface, props: { hasPolicy: Boolean(policy), ownDue: Boolean(input.dueAt) } });
  const dueLine = actor.timezone ? ` Due ${formatInZone(dueAt, actor.timezone)}.` : "";
  await notify({ workspaceId: actor.workspaceId, organizationId: item.organizationId, userId: input.assigneeUserId ?? null, kind: "approval.requested", title: `Review requested: ${item.title}`, body: `${input.note ?? `${actor.userName} asked for approval.`}${dueLine}`, href: workspacePath(actor.workspaceId, `approvals?request=${requestId}`), email: true });
  return { requestId, policyName: policy?.name ?? null, dueAt };
}
