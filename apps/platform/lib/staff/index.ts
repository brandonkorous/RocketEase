import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { staffUser } from "@/db/schema/staff";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/session";
import { parseStaffEmails, resolveStaffRole, staffAtLeast, type StaffRole } from "./policy";

export { STAFF_ROLES, type StaffRole } from "@/db/schema/staff";
export { staffAtLeast } from "./policy";

export type StaffContext = { userId: string; email: string; name: string; role: StaffRole };

let cachedEmails: { raw: string; emails: Set<string> } | null = null;

function envEmails(): Set<string> {
  const raw = process.env.STAFF_EMAILS ?? "";
  if (cachedEmails?.raw !== raw) cachedEmails = { raw, emails: parseStaffEmails(raw) };
  return cachedEmails.emails;
}

/** The signed-in person's staff role, or null. Cached per request. */
export const staffRole = cache(async (): Promise<StaffContext | null> => {
  const session = await requireUser();
  const row = (await db.query.staffUser.findFirst({ where: (s, { eq: e }) => e(s.userId, session.user.id), columns: { role: true } })) ?? null;
  const role = resolveStaffRole(row, envEmails(), { email: session.user.email, emailVerified: session.user.emailVerified ?? false });
  if (!role) return null;
  return { userId: session.user.id, email: session.user.email, name: session.user.name, role };
});

/**
 * Gate for every /staff route and staff action.
 *
 * A non-staff visitor gets a 404, not a 403: the surface does not advertise
 * itself, the same reason `requireWorkspace` redirects rather than leaking that
 * a workspace exists. Denials are audited — an authenticated person probing the
 * operator surface is worth a record; anonymous scanners are not.
 */
export async function requireStaff(minimum: StaffRole = "support"): Promise<StaffContext> {
  const ctx = await staffRole();
  if (!ctx || !staffAtLeast(ctx.role, minimum)) {
    const session = await requireUser();
    await audit({ action: `authz.deny:staff.${minimum}`, actorUserId: session.user.id, result: "denied" });
    notFound();
  }
  return ctx;
}

/** Promote or demote an operator. Admin-only, and never the last admin. */
export async function setStaffRole(input: { userId: string; role: StaffRole | null; actorUserId: string; note?: string }): Promise<void> {
  if (input.role === null) {
    await db.delete(staffUser).where(eq(staffUser.userId, input.userId));
    return;
  }
  await db
    .insert(staffUser)
    .values({ userId: input.userId, role: input.role, grantedByUserId: input.actorUserId, note: input.note ?? null })
    .onConflictDoUpdate({ target: staffUser.userId, set: { role: input.role, updatedAt: new Date() } });
}

/** How many stored admins exist, so the surface can refuse to remove the last one. */
export async function storedAdminCount(): Promise<number> {
  const rows = await db.select({ userId: staffUser.userId }).from(staffUser).where(eq(staffUser.role, "admin"));
  return rows.length;
}

/** True when STAFF_EMAILS can still let someone in — a stored-admin count of 0 is then not a lockout. */
export const hasEnvAdmins = () => envEmails().size > 0;
