import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { AppPage, PageEmpty, PageHeader } from "@/components/page-frame";
import { NotificationList } from "@/components/notification-list";
import { db } from "@/db";
import { notification } from "@/db/schema/app";
import { requireWorkspace } from "@/lib/session";
import { formatInZone } from "@/lib/time";
import { workspacePath } from "@/lib/nav";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const ctx = await requireWorkspace(workspaceId);
  const rows = await db.select().from(notification).where(and(eq(notification.workspaceId, workspaceId), eq(notification.userId, ctx.session.user.id))).orderBy(desc(notification.createdAt)).limit(100);
  void Link;
  return (
    <AppPage>
      <PageHeader title="Notifications" description="Everything that needs you in this workspace, newest first." />
      {rows.length === 0 ? (
        <PageEmpty title="You're all caught up" description="Publish failures, approval requests, and security events show up here and deep-link to the exact object." primary={{ label: "Back to Home", href: workspacePath(workspaceId, "home") }} />
      ) : (
        <NotificationList workspaceId={workspaceId} items={rows.map((r) => ({ id: r.id, kind: r.kind, title: r.title, body: r.body, href: r.href, read: Boolean(r.readAt), when: formatInZone(r.createdAt, ctx.workspace.timezone, { dateStyle: "medium", timeStyle: "short" }) }))} />
      )}
    </AppPage>
  );
}
