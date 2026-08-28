import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { member, organization } from "@/db/schema/auth";
import { AuthorizationError } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/session";

export type OrgContext = { userId: string; userName: string; organizationId: string; organizationName: string; role: string };

/**
 * Org-level gate for the agency surface. Branding and the roll-up sit above
 * any single workspace, so membership of the organization decides — with
 * owner/admin required to change anything. Denials are audited like every
 * other authorization failure (permissions.md).
 */
export async function requireOrgAdmin(organizationId: string): Promise<OrgContext> {
  const session = await requireUser();
  const [row] = await db
    .select({ role: member.role, name: organization.name })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(and(eq(member.organizationId, organizationId), eq(member.userId, session.user.id)));
  if (!row || !["owner", "admin"].includes(row.role)) {
    await audit({ action: "authz.deny:agency.branding", actorUserId: session.user.id, organizationId, result: "denied" });
    throw new AuthorizationError("workspace.settings");
  }
  return { userId: session.user.id, userName: session.user.name, organizationId, organizationName: row.name, role: row.role };
}

/** Read-only variant: any member of the organization may generate a roll-up of the clients they can already see. */
export async function requireOrgMember(organizationId: string): Promise<OrgContext> {
  const session = await requireUser();
  const [row] = await db
    .select({ role: member.role, name: organization.name })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(and(eq(member.organizationId, organizationId), eq(member.userId, session.user.id)));
  if (!row) {
    await audit({ action: "authz.deny:agency.rollup", actorUserId: session.user.id, organizationId, result: "denied" });
    throw new AuthorizationError("analytics.view");
  }
  return { userId: session.user.id, userName: session.user.name, organizationId, organizationName: row.name, role: row.role };
}
