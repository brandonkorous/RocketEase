/*
 * In-app notifications (primary) with optional email for the cases
 * onboarding.md reserves for email: publish failures, approvals, security.
 */
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema/auth";
import { notification } from "@/db/schema/app";
import { workspaceMembership } from "@/db/schema/app";
import { emit } from "./jobs/outbox";

export type NotifyInput = {
  workspaceId: string;
  organizationId: string;
  /** Specific recipient, or null to fan out to owners/admins/managers. */
  userId: string | null;
  kind: string;
  title: string;
  body?: string;
  href?: string;
  email?: boolean;
};

export async function notify(input: NotifyInput) {
  let recipients: string[];
  if (input.userId) recipients = [input.userId];
  else {
    const rows = await db.select({ userId: workspaceMembership.userId, role: workspaceMembership.role }).from(workspaceMembership).where(eq(workspaceMembership.workspaceId, input.workspaceId));
    recipients = rows.filter((r) => ["owner", "admin", "manager"].includes(r.role)).map((r) => r.userId);
  }
  if (recipients.length === 0) return;
  await db.transaction(async (tx) => {
    for (const uid of recipients) {
      await tx.insert(notification).values({ organizationId: input.organizationId, workspaceId: input.workspaceId, userId: uid, kind: input.kind, title: input.title, body: input.body ?? null, href: input.href ?? null });
      if (input.email) {
        const u = await tx.query.user.findFirst({ where: (x, { eq }) => eq(x.id, uid) });
        if (u?.email) {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:5001";
          await emit(tx, "mail.send", { to: u.email, template: "notification", data: { name: u.name, title: input.title, body: input.body ?? "", url: input.href ? `${appUrl}${input.href}` : appUrl }, organizationId: input.organizationId }, { organizationId: input.organizationId, workspaceId: input.workspaceId });
        }
      }
    }
  });
}

export async function unreadCount(userId: string, workspaceId: string) {
  const rows = await db.select({ id: notification.id }).from(notification).where(and(eq(notification.userId, userId), eq(notification.workspaceId, workspaceId), isNull(notification.readAt)));
  return rows.length;
}

export { user };
