import type { Metadata } from "next";
import { NotificationsScreen } from "@/components/notifications/screen";
import { loadNotifications } from "@/lib/notifications/query";
import { requireWorkspace } from "@/lib/session";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<{ tab?: string; page?: string }> }) {
  const [{ workspaceId }, sp] = await Promise.all([params, searchParams]);
  const ctx = await requireWorkspace(workspaceId);
  const view = await loadNotifications(ctx, sp);
  return <NotificationsScreen view={view} />;
}
