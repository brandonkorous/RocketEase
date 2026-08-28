"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { WORKSPACE_ROLES } from "@/db/schema/app";
import { approvalPolicy, type PolicyRule } from "@/db/schema/approvals";
import { audit } from "@/lib/audit";
import { requireCapability } from "@/lib/session";
import { workspacePath } from "@/lib/nav";
import { fail, guard, type ActionState } from "./content/shared";

const policySchema = z.object({
  workspaceId: z.string(), policyId: z.string().optional(), name: z.string().trim().min(2).max(80), enabled: z.boolean().default(true),
  channelIds: z.array(z.string()).default([]), authorRoles: z.array(z.enum(WORKSPACE_ROLES)).default([]),
  approverRoles: z.array(z.enum(WORKSPACE_ROLES)).min(1, "Choose at least one approver role"), approverUserIds: z.array(z.string()).default([]),
  separationOfDuty: z.boolean().default(true), dueHours: z.number().int().min(1).max(720).default(24),
});
export type PolicyInput = z.input<typeof policySchema>;

export async function savePolicy(input: PolicyInput): Promise<ActionState & { policyId?: string }> {
  const parsed = policySchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the policy");
  const d = parsed.data;
  return guard(async () => {
    const ctx = await requireCapability(d.workspaceId, "workspace.settings");
    const rule: PolicyRule = { channelIds: d.channelIds, authorRoles: d.authorRoles };
    const values = { name: d.name, enabled: d.enabled, rule, approverRoles: d.approverRoles, approverUserIds: d.approverUserIds, separationOfDuty: d.separationOfDuty, dueHours: d.dueHours, updatedAt: new Date() };
    let policyId = d.policyId;
    if (policyId) {
      const r = await db.update(approvalPolicy).set(values).where(and(eq(approvalPolicy.id, policyId), eq(approvalPolicy.workspaceId, d.workspaceId))).returning({ id: approvalPolicy.id });
      if (!r.length) return fail("Policy not found.");
    } else {
      const [row] = await db.insert(approvalPolicy).values({ ...values, organizationId: ctx.workspace.organizationId, workspaceId: d.workspaceId, createdByUserId: ctx.session.user.id }).returning({ id: approvalPolicy.id });
      policyId = row.id;
    }
    await audit({ action: d.policyId ? "approval_policy.update" : "approval_policy.create", actorUserId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId: d.workspaceId, targetType: "approval_policy", targetId: policyId, summary: { after: values } });
    revalidatePath(workspacePath(d.workspaceId, "settings/team"));
    return { ok: "Policy saved.", policyId };
  });
}

export async function deletePolicy(workspaceId: string, policyId: string): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "workspace.settings");
    await db.delete(approvalPolicy).where(and(eq(approvalPolicy.id, policyId), eq(approvalPolicy.workspaceId, workspaceId)));
    await audit({ action: "approval_policy.delete", actorUserId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId, targetType: "approval_policy", targetId: policyId });
    revalidatePath(workspacePath(workspaceId, "settings/team"));
    return { ok: "Policy deleted." };
  });
}
