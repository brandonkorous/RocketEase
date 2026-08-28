import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { member } from "@/db/schema/auth";
import { audit } from "./audit";
import { AuthorizationError } from "./authz";
import { requireWorkspace, type WorkspaceContext } from "./session";

export type OrgRole = "owner" | "admin" | "member";

/** Better Auth organization role for a user, or null when they aren't a member. */
export async function orgRoleOf(organizationId: string, userId: string): Promise<OrgRole | null> {
  const row = await db.query.member.findFirst({
    where: and(eq(member.organizationId, organizationId), eq(member.userId, userId)),
    columns: { role: true },
  });
  if (!row) return null;
  return row.role === "owner" || row.role === "admin" ? row.role : "member";
}

export const isOrgAdmin = (role: OrgRole | null) => role === "owner" || role === "admin";

/**
 * Org-scoped gate for settings that belong to the billing boundary rather than
 * one workspace (SSO, SCIM). Enters through a workspace so tenancy is still
 * checked per request, then requires organization owner/admin. Denials are
 * audited like any other authorization failure.
 */
export async function requireOrgAdmin(workspaceId: string): Promise<WorkspaceContext & { orgRole: OrgRole }> {
  const ctx = await requireWorkspace(workspaceId);
  const role = await orgRoleOf(ctx.workspace.organizationId, ctx.session.user.id);
  if (!isOrgAdmin(role)) {
    await audit({
      action: "authz.deny:org.security",
      actorUserId: ctx.session.user.id,
      organizationId: ctx.workspace.organizationId,
      workspaceId,
      result: "denied",
    });
    throw new AuthorizationError("org.billing");
  }
  return { ...ctx, orgRole: role as OrgRole };
}
