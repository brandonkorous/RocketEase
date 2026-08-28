/*
 * Approval policy evaluation + helpers shared by actions and the worker.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { approvalPolicy, type ApprovalPolicy } from "@/db/schema/approvals";
import { postVariant } from "@/db/schema/content";
import type { WorkspaceRole } from "@/db/schema/app";

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

/** Can this principal decide on the request? Respects assignee + separation of duty. */
export function canDecide(p: { userId: string; role: WorkspaceRole; grants: readonly string[] }, req: { assigneeUserId: string | null; approverRoles: WorkspaceRole[]; separationOfDuty: boolean; requestedByUserId: string | null }): { ok: boolean; reason?: string } {
  if (req.separationOfDuty && req.requestedByUserId === p.userId) return { ok: false, reason: "You can't approve your own request." };
  if (req.assigneeUserId) return req.assigneeUserId === p.userId || ["owner", "admin"].includes(p.role) ? { ok: true } : { ok: false, reason: "This request is assigned to someone else." };
  if (p.role === "client_approver") return { ok: false, reason: "Client approvers can only decide requests assigned to them." };
  return req.approverRoles.includes(p.role) ? { ok: true } : { ok: false, reason: "Your role can't approve content here." };
}
