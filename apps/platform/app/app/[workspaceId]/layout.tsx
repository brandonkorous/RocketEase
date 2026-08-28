import { requireWorkspace } from "@/lib/session";
import { unreadCount } from "@/lib/notifications";
import { conversationSummary } from "@/lib/engagement/summary";
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
  const [unread, convs] = await Promise.all([unreadCount(session.user.id, workspaceId), conversationSummary(workspaceId, session.user.id, workspace.timezone, 0)]);

  return (
    <WorkspaceShell
      workspace={workspace}
      workspaces={workspaces}
      user={{ name: session.user.name, email: session.user.email, image: session.user.image }}
      unread={unread}
      badges={{ inbox: convs.unread }}
    >
      {children}
    </WorkspaceShell>
  );
}
