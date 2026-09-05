import { requireWorkspace } from "@/lib/session";
import { unreadCount } from "@/lib/notifications";
import { conversationSummary } from "@/lib/engagement/summary";
import { overdueRequestsFor } from "@/lib/approvals/due";
import { WorkspaceShell } from "@/components/app-shell";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const { session, workspace, workspaces } = await requireWorkspace(workspaceId);
  // Sidebar badges are actionable counts only (navigation.md): unresolved conversations, overdue approvals.
  const me = { userId: session.user.id, role: workspace.role, grants: workspace.grants };
  const [unread, convs, overdue] = await Promise.all([unreadCount(session.user.id, workspaceId), conversationSummary(workspaceId, session.user.id, workspace.timezone, 0), overdueRequestsFor(workspaceId, me)]);

  return (
    <WorkspaceShell
      workspace={workspace}
      workspaces={workspaces}
      user={{ name: session.user.name, email: session.user.email, image: session.user.image }}
      unread={unread}
      badges={{ inbox: convs.unread, approvals: overdue.length }}
    >
      {children}
    </WorkspaceShell>
  );
}
