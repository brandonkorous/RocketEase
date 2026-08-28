"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { emit } from "@/lib/jobs/outbox";
import { requireCapability } from "@/lib/session";
import { workspacePath } from "@/lib/nav";
import { fail, guard, type ActionState } from "./content/shared";
import { db } from "@/db";
import { WORKSPACE_ROLES, workspaceInvitation, workspaceMembership } from "@/db/schema/app";

export type { ActionState };

const inviteSchema = z.object({
  workspaceId: z.string().min(1),
  email: z.string().trim().email("Enter a valid email"),
  role: z.enum(WORKSPACE_ROLES),
});

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:5001";

/** Invite someone to a workspace with a role. Owners/admins only (or managers with the grant). */
export async function inviteMember(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = inviteSchema.safeParse({
    workspaceId: formData.get("workspaceId"),
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form");
  const { workspaceId, email, role } = parsed.data;

  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "workspace.members");
    // Only owners may mint owners; admins may not escalate above themselves.
    if (role === "owner" && ctx.workspace.role !== "owner") return fail("Only an owner can invite another owner.");

    const lower = email.toLowerCase();

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 48 * 3_600_000);

    await db.transaction(async (tx) => {
      // Supersede any pending invitation for the same address + workspace.
      await tx
        .update(workspaceInvitation)
        .set({ status: "revoked" })
        .where(
          and(
            eq(workspaceInvitation.workspaceId, workspaceId),
            eq(workspaceInvitation.email, lower),
            eq(workspaceInvitation.status, "pending"),
          ),
        );
      const [inv] = await tx
        .insert(workspaceInvitation)
        .values({
          organizationId: ctx.workspace.organizationId,
          workspaceId,
          email: lower,
          role,
          token,
          invitedByUserId: ctx.session.user.id,
          expiresAt,
        })
        .returning();
      await emit(
        tx,
        "mail.send",
        {
          to: lower,
          template: "org.invite",
          data: {
            inviterName: ctx.session.user.name,
            organizationName: ctx.workspace.organizationName,
            workspaceName: ctx.workspace.name,
            role,
            url: `${appUrl()}/invite/${token}`,
          },
          organizationId: ctx.workspace.organizationId,
        },
        { organizationId: ctx.workspace.organizationId, workspaceId },
      );
      await audit({
        action: "membership.invite",
        actorUserId: ctx.session.user.id,
        organizationId: ctx.workspace.organizationId,
        workspaceId,
        targetType: "workspace_invitation",
        targetId: inv.id,
        summary: { after: { email: lower, role } },
      });
    });

    revalidatePath(workspacePath(workspaceId, "team"));
    return { ok: `Invitation sent to ${lower}.` };
  });
}

export async function revokeInvitation(workspaceId: string, invitationId: string): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "workspace.members");
    await db
      .update(workspaceInvitation)
      .set({ status: "revoked" })
      .where(and(eq(workspaceInvitation.id, invitationId), eq(workspaceInvitation.workspaceId, workspaceId)));
    await audit({
      action: "membership.invite_revoke",
      actorUserId: ctx.session.user.id,
      organizationId: ctx.workspace.organizationId,
      workspaceId,
      targetType: "workspace_invitation",
      targetId: invitationId,
    });
    revalidatePath(workspacePath(workspaceId, "team"));
    return { ok: "Invitation revoked." };
  });
}

const roleSchema = z.object({ workspaceId: z.string(), membershipId: z.string(), role: z.enum(WORKSPACE_ROLES) });

export async function updateMemberRole(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = roleSchema.safeParse({
    workspaceId: formData.get("workspaceId"),
    membershipId: formData.get("membershipId"),
    role: formData.get("role"),
  });
  if (!parsed.success) return fail("Invalid role change");
  const { workspaceId, membershipId, role } = parsed.data;

  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "workspace.members");
    const target = await db.query.workspaceMembership.findFirst({
      where: (m, { and, eq }) => and(eq(m.id, membershipId), eq(m.workspaceId, workspaceId)),
    });
    if (!target) return fail("Member not found.");
    if (target.userId === ctx.session.user.id) return fail("You can't change your own role.");
    if ((target.role === "owner" || role === "owner") && ctx.workspace.role !== "owner")
      return fail("Only an owner can change owner roles.");

    await db.update(workspaceMembership).set({ role }).where(eq(workspaceMembership.id, membershipId));
    await audit({
      action: "membership.role_change",
      actorUserId: ctx.session.user.id,
      organizationId: ctx.workspace.organizationId,
      workspaceId,
      targetType: "workspace_membership",
      targetId: membershipId,
      summary: { before: { role: target.role }, after: { role } },
    });
    revalidatePath(workspacePath(workspaceId, "team"));
    return { ok: "Role updated." };
  });
}

export async function removeMember(workspaceId: string, membershipId: string): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "workspace.members");
    const target = await db.query.workspaceMembership.findFirst({
      where: (m, { and, eq }) => and(eq(m.id, membershipId), eq(m.workspaceId, workspaceId)),
    });
    if (!target) return fail("Member not found.");
    if (target.userId === ctx.session.user.id) return fail("You can't remove yourself. Transfer ownership first.");
    if (target.role === "owner" && ctx.workspace.role !== "owner") return fail("Only an owner can remove an owner.");

    await db.delete(workspaceMembership).where(eq(workspaceMembership.id, membershipId));
    await audit({
      action: "membership.remove",
      actorUserId: ctx.session.user.id,
      organizationId: ctx.workspace.organizationId,
      workspaceId,
      targetType: "workspace_membership",
      targetId: membershipId,
      summary: { before: { userId: target.userId, role: target.role } },
    });
    revalidatePath(workspacePath(workspaceId, "team"));
    return { ok: "Member removed." };
  });
}
