/*
 * In-app notifications (primary) with optional email for the cases
 * onboarding.md reserves for email: publish failures, approvals, rights.
 * A member's Settings → Notifications choices decide, per preference, whether
 * a kind reaches the app and whether it is also emailed; locked kinds
 * (publish failures) always reach the app.
 */
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema/auth";
import { notification } from "@/db/schema/app";
import { workspaceMembership } from "@/db/schema/app";
import { emit } from "./jobs/outbox";
import { emailWanted, inAppWanted, type NotificationKind, type StoredPrefs } from "./notifications/catalog";

export type NotifyInput = {
  workspaceId: string;
  organizationId: string;
  /** Specific recipient, or null to fan out to owners/admins/managers. */
  userId: string | null;
  kind: NotificationKind;
  title: string;
  body?: string;
  href?: string;
  /** The emitter's email default, used only for a kind with no preference row. */
  email?: boolean;
};

async function recipientsFor(input: NotifyInput): Promise<string[]> {
  if (input.userId) return [input.userId];
  const rows = await db.select({ userId: workspaceMembership.userId, role: workspaceMembership.role }).from(workspaceMembership).where(eq(workspaceMembership.workspaceId, input.workspaceId));
  return rows.filter((r) => ["owner", "admin", "manager"].includes(r.role)).map((r) => r.userId);
}

export async function notify(input: NotifyInput) {
  const recipients = await recipientsFor(input);
  if (recipients.length === 0) return;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:5001";
  await db.transaction(async (tx) => {
    for (const uid of recipients) {
      const [m] = await tx.select({ prefs: workspaceMembership.notificationPreferences }).from(workspaceMembership).where(and(eq(workspaceMembership.workspaceId, input.workspaceId), eq(workspaceMembership.userId, uid)));
      const prefs: StoredPrefs = m?.prefs ?? {};
      if (inAppWanted(prefs, input.kind)) {
        await tx.insert(notification).values({ organizationId: input.organizationId, workspaceId: input.workspaceId, userId: uid, kind: input.kind, title: input.title, body: input.body ?? null, href: input.href ?? null });
      }
      if (!emailWanted(prefs, input.kind, Boolean(input.email))) continue;
      const u = await tx.query.user.findFirst({ where: (x, { eq }) => eq(x.id, uid) });
      if (!u?.email) continue;
      await emit(tx, "mail.send", { to: u.email, template: "notification", data: { name: u.name, title: input.title, body: input.body ?? "", url: input.href ? `${appUrl}${input.href}` : appUrl }, organizationId: input.organizationId }, { organizationId: input.organizationId, workspaceId: input.workspaceId });
    }
  });
}

export async function unreadCount(userId: string, workspaceId: string) {
  const rows = await db.select({ id: notification.id }).from(notification).where(and(eq(notification.userId, userId), eq(notification.workspaceId, workspaceId), isNull(notification.readAt)));
  return rows.length;
}

export { user };
