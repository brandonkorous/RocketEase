/*
 * Who a report run may be delivered to, decided at run time (analytics.md
 * "Reports": scheduled delivery requires permission checks at run time).
 *
 * Members are re-checked against current workspace membership. External
 * addresses are only ever delivered to when they completed the double opt-in
 * (`external_recipient.status = 'verified'`); anything else is skipped and
 * reported back so the UI can show it as pending.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { workspaceMembership } from "@/db/schema/app";
import { externalRecipient } from "@/db/schema/analytics";

export type ResolvedRecipients = { members: string[]; external: string[]; skipped: string[] };

const lower = (s: string) => s.trim().toLowerCase();

async function memberEmails(workspaceId: string): Promise<Set<string>> {
  const rows = await db.select({ userId: workspaceMembership.userId }).from(workspaceMembership).where(eq(workspaceMembership.workspaceId, workspaceId));
  if (rows.length === 0) return new Set();
  const users = await db.query.user.findMany({ where: (u, { inArray }) => inArray(u.id, rows.map((r) => r.userId)) });
  return new Set(users.map((u) => lower(u.email)));
}

/** Verified external addresses for a workspace (never leaves this workspace). */
export async function verifiedExternal(workspaceId: string): Promise<Set<string>> {
  const rows = await db
    .select({ email: externalRecipient.email, unsubscribedAt: externalRecipient.unsubscribedAt })
    .from(externalRecipient)
    .where(and(eq(externalRecipient.workspaceId, workspaceId), eq(externalRecipient.status, "verified")));
  return new Set(rows.filter((r) => !r.unsubscribedAt).map((r) => lower(r.email)));
}

export async function resolveRecipients(input: { workspaceId: string; members: string[]; external: string[]; clientFacing: boolean }): Promise<ResolvedRecipients> {
  const [allowedMembers, allowedExternal] = await Promise.all([
    input.members.length ? memberEmails(input.workspaceId) : Promise.resolve(new Set<string>()),
    input.clientFacing && input.external.length ? verifiedExternal(input.workspaceId) : Promise.resolve(new Set<string>()),
  ]);
  const members = input.members.filter((r) => allowedMembers.has(lower(r)));
  const external = input.external.filter((r) => allowedExternal.has(lower(r)));
  const kept = new Set([...members, ...external].map(lower));
  const skipped = [...input.members, ...input.external].filter((r) => !kept.has(lower(r)));
  return { members, external, skipped };
}
