"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/session";
import { workspacePath } from "@/lib/nav";
import { db } from "@/db";
import { workspaceInvitation, workspaceMembership } from "@/db/schema/app";
import { fail, type ActionState } from "./content/shared";

const orgRole = (r: string) => (r === "owner" ? "owner" : r === "admin" ? "admin" : "member");

/** Accept: signed-in user whose email matches. Adds org membership if missing, then workspace membership. */
export async function acceptInvitation(token: string): Promise<ActionState> {
  const session = await requireUser();
  const inv = await db.query.workspaceInvitation.findFirst({ where: (i, { eq }) => eq(i.token, token) });
  if (!inv || inv.status !== "pending") return fail("This invitation is no longer valid.");
  if (inv.expiresAt < new Date()) {
    await db.update(workspaceInvitation).set({ status: "expired" }).where(eq(workspaceInvitation.id, inv.id));
    return fail("This invitation has expired. Ask for a new one.");
  }
  if (inv.email !== session.user.email.toLowerCase()) return fail(`This invitation was sent to ${inv.email}. Sign in with that address to accept it.`);

  const h = await headers();
  const already = await db.query.member.findFirst({ where: (m, { and, eq }) => and(eq(m.organizationId, inv.organizationId), eq(m.userId, session.user.id)) });
  if (!already) await auth.api.addMember({ headers: h, body: { userId: session.user.id, organizationId: inv.organizationId, role: orgRole(inv.role) } });

  await db.transaction(async (tx) => {
    await tx
      .insert(workspaceMembership)
      .values({ organizationId: inv.organizationId, workspaceId: inv.workspaceId, userId: session.user.id, role: inv.role, grants: inv.grants, lastOpenedAt: new Date() })
      .onConflictDoUpdate({ target: [workspaceMembership.workspaceId, workspaceMembership.userId], set: { role: inv.role, grants: inv.grants } });
    await tx.update(workspaceInvitation).set({ status: "accepted", acceptedAt: new Date(), acceptedByUserId: session.user.id }).where(eq(workspaceInvitation.id, inv.id));
  });
  await auth.api.setActiveOrganization({ headers: h, body: { organizationId: inv.organizationId } });
  await audit({ action: "membership.invite_accept", actorUserId: session.user.id, organizationId: inv.organizationId, workspaceId: inv.workspaceId, targetType: "workspace_invitation", targetId: inv.id, summary: { after: { role: inv.role } } });
  redirect(workspacePath(inv.workspaceId));
}
