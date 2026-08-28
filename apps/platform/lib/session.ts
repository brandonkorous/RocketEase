import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, desc, eq, isNull } from "drizzle-orm";
import { auth } from "./auth";
import { db } from "@/db";
import { organization } from "@/db/schema/auth";
import { workspace, workspaceMembership, type WorkspaceRole } from "@/db/schema/app";
import { AuthorizationError, can, type Capability } from "./authz";
import { audit } from "./audit";

/** Current session or null. Cached per request. */
export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

/** Redirects to /login when unauthenticated. */
export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export type WorkspaceSummary = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  organizationId: string;
  organizationName: string;
  role: WorkspaceRole;
  grants: string[];
  pinned: boolean;
};

/** Every non-archived workspace the user is a member of, most recently opened first. */
export const listUserWorkspaces = cache(async (userId: string): Promise<WorkspaceSummary[]> => {
  const rows = await db
    .select({
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      timezone: workspace.timezone,
      organizationId: workspace.organizationId,
      organizationName: organization.name,
      role: workspaceMembership.role,
      grants: workspaceMembership.grants,
      pinned: workspaceMembership.pinned,
    })
    .from(workspaceMembership)
    .innerJoin(workspace, eq(workspace.id, workspaceMembership.workspaceId))
    .innerJoin(organization, eq(organization.id, workspace.organizationId))
    .where(and(eq(workspaceMembership.userId, userId), isNull(workspace.archivedAt)))
    .orderBy(desc(workspaceMembership.pinned), desc(workspaceMembership.lastOpenedAt), workspace.name);
  return rows;
});

export type WorkspaceContext = {
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>;
  workspace: WorkspaceSummary;
  workspaces: WorkspaceSummary[];
};

/**
 * Tenant gate for every /app/:workspaceId route. Membership is checked
 * server-side on each request; a non-member gets a 404-shaped redirect rather
 * than a hint that the workspace exists (agency safety, permissions.md).
 */
export async function requireWorkspace(workspaceId: string): Promise<WorkspaceContext> {
  const session = await requireUser();
  const workspaces = await listUserWorkspaces(session.user.id);
  const current = workspaces.find((w) => w.id === workspaceId);
  if (!current) redirect(workspaces.length ? "/" : "/onboarding");

  // Fire-and-forget: recency for the switcher. Not awaited on the render path.
  void db
    .update(workspaceMembership)
    .set({ lastOpenedAt: new Date() })
    .where(and(eq(workspaceMembership.workspaceId, workspaceId), eq(workspaceMembership.userId, session.user.id)))
    .catch(() => {});

  return { session, workspace: current, workspaces };
}

/**
 * Server-side capability gate for actions. Denials are audited (permissions.md)
 * and surface as AuthorizationError so callers can return a clean message.
 */
export async function requireCapability(
  workspaceId: string,
  cap: Capability,
  resolved?: { policyAllows?: boolean; isAssigned?: boolean },
): Promise<WorkspaceContext> {
  const ctx = await requireWorkspace(workspaceId);
  const principal = { role: ctx.workspace.role, grants: ctx.workspace.grants };
  if (!can(principal, cap, resolved)) {
    await audit({
      action: `authz.deny:${cap}`,
      actorUserId: ctx.session.user.id,
      organizationId: ctx.workspace.organizationId,
      workspaceId,
      result: "denied",
    });
    throw new AuthorizationError(cap);
  }
  return ctx;
}

/** Non-throwing check for conditional UI on the server. */
export function hasCapability(ws: WorkspaceSummary, cap: Capability) {
  return can({ role: ws.role, grants: ws.grants }, cap);
}
