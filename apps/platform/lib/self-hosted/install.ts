/*
 * The one organization of a self-hosted install: the first ever created. No
 * `server-only` — the auth hook and the worker both read it.
 */
import { and, asc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { workspaceInvitation } from "@/db/schema/app";
import { organization } from "@/db/schema/auth";

export type InstallOrganization = { id: string; name: string; createdAt: Date };

export async function installOrganization(): Promise<InstallOrganization | null> {
  const [row] = await db.select({ id: organization.id, name: organization.name, createdAt: organization.createdAt }).from(organization).orderBy(asc(organization.createdAt)).limit(1);
  return row ?? null;
}

/** A pending, unexpired workspace invitation for this address — the only door into a claimed install. */
export async function hasPendingInvitation(email: string, now = new Date()): Promise<boolean> {
  const [row] = await db
    .select({ id: workspaceInvitation.id })
    .from(workspaceInvitation)
    .where(and(eq(workspaceInvitation.email, email.trim().toLowerCase()), eq(workspaceInvitation.status, "pending"), gt(workspaceInvitation.expiresAt, now)))
    .limit(1);
  return Boolean(row);
}
