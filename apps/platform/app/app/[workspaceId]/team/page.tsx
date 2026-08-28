import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { AppPage, PageHeader } from "@/components/page-frame";
import { TeamPanel, type InvitationRow, type MemberRow } from "@/components/team-panel";
import { hasCapability, requireWorkspace } from "@/lib/session";
import { db } from "@/db";
import { user } from "@/db/schema/auth";
import { workspaceInvitation, workspaceMembership } from "@/db/schema/app";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const ctx = await requireWorkspace(workspaceId);
  const canManage = hasCapability(ctx.workspace, "workspace.members");

  const rows = await db
    .select({
      id: workspaceMembership.id,
      userId: workspaceMembership.userId,
      role: workspaceMembership.role,
      grants: workspaceMembership.grants,
      name: user.name,
      email: user.email,
      image: user.image,
    })
    .from(workspaceMembership)
    .innerJoin(user, eq(user.id, workspaceMembership.userId))
    .where(eq(workspaceMembership.workspaceId, workspaceId))
    .orderBy(workspaceMembership.createdAt);

  const members: MemberRow[] = rows.map((r) => ({ ...r, isYou: r.userId === ctx.session.user.id }));

  const invitations: InvitationRow[] = canManage
    ? (
        await db
          .select({
            id: workspaceInvitation.id,
            email: workspaceInvitation.email,
            role: workspaceInvitation.role,
            expiresAt: workspaceInvitation.expiresAt,
            invitedBy: workspaceInvitation.invitedByUserId,
          })
          .from(workspaceInvitation)
          .where(and(eq(workspaceInvitation.workspaceId, workspaceId), eq(workspaceInvitation.status, "pending")))
      ).map((i) => ({ ...i, expiresAt: i.expiresAt.toISOString() }))
    : [];

  return (
    <AppPage>
      <PageHeader title="Team" description={`Who can work in ${ctx.workspace.name}, and what they can do.`} />
      <TeamPanel workspaceId={workspaceId} members={members} invitations={invitations} canManage={canManage} myRole={ctx.workspace.role} />
    </AppPage>
  );
}
