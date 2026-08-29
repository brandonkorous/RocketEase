import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { scimIdentity } from "@/db/schema/scim";
import { workspaceMembership, WORKSPACE_ROLES, type WorkspaceRole } from "@/db/schema/app";
import { audit } from "@/lib/audit";
import { SCIM_SCHEMA, scimBaseUrl } from "./constants";
import { stringTerm, type ScimFilterTerm } from "./filter";
import { ScimError } from "./errors";
import { groupDisplayName, groupIdFor, parseGroupName, type GroupRef } from "./groups";
import type { ScimContext } from "./auth";
import { orgWorkspaces } from "./provision";

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:5001";

export type GroupResource = {
  schemas: string[];
  id: string;
  displayName: string;
  members: { value: string; display: string }[];
  meta: { resourceType: "Group"; location: string };
};

type MemberRow = { userId: string; workspaceId: string; role: WorkspaceRole; userName: string };

/** Every provisioned membership in the organization, for grouping in memory. */
async function orgMemberships(organizationId: string): Promise<MemberRow[]> {
  return db
    .select({
      userId: workspaceMembership.userId,
      workspaceId: workspaceMembership.workspaceId,
      role: workspaceMembership.role,
      userName: scimIdentity.userName,
    })
    .from(workspaceMembership)
    .innerJoin(
      scimIdentity,
      and(eq(scimIdentity.userId, workspaceMembership.userId), eq(scimIdentity.organizationId, organizationId)),
    )
    .where(eq(workspaceMembership.organizationId, organizationId));
}

function toGroup(displayName: string, rows: MemberRow[]): GroupResource {
  return {
    schemas: [SCIM_SCHEMA.group],
    id: groupIdFor(displayName),
    displayName,
    members: rows.map((r) => ({ value: r.userId, display: r.userName })),
    meta: { resourceType: "Group", location: `${scimBaseUrl(appUrl())}/Groups/${encodeURIComponent(groupIdFor(displayName))}` },
  };
}

/** Groups are derived: one per workspace per role preset, never stored. */
export async function listGroups(
  organizationId: string,
  terms: ScimFilterTerm[],
  paging: { offset: number; count: number },
): Promise<{ total: number; groups: GroupResource[] }> {
  const wanted = stringTerm(terms, "displayName") ?? stringTerm(terms, "id");
  const unknown = terms.find((t) => !["displayname", "id"].includes(t.attr));
  if (unknown) throw new ScimError(400, `Filtering on ${unknown.attr} is not supported`, "invalidFilter");
  const [workspaces, memberships] = await Promise.all([orgWorkspaces(organizationId), orgMemberships(organizationId)]);
  const all = workspaces.flatMap((w) =>
    WORKSPACE_ROLES.map((role) =>
      toGroup(groupDisplayName(w.slug, role), memberships.filter((m) => m.workspaceId === w.id && m.role === role)),
    ),
  );
  const matched = wanted ? all.filter((g) => g.id === groupIdFor(wanted)) : all;
  return { total: matched.length, groups: matched.slice(paging.offset, paging.offset + paging.count) };
}

/** Resolves a group id to its workspace, or throws 404 when it isn't one of ours. */
export async function resolveGroup(organizationId: string, id: string): Promise<{ ref: GroupRef; workspaceId: string; displayName: string }> {
  const ref = parseGroupName(id);
  if (!ref) throw new ScimError(404, `No group ${id}`, "invalidValue");
  const workspaces = await orgWorkspaces(organizationId);
  const ws = workspaces.find((w) => w.slug === ref.workspaceSlug);
  if (!ws) throw new ScimError(404, `No group ${id}`, "invalidValue");
  return { ref, workspaceId: ws.id, displayName: groupDisplayName(ref.workspaceSlug, ref.role) };
}

export async function getGroup(organizationId: string, id: string): Promise<GroupResource> {
  const { ref, workspaceId, displayName } = await resolveGroup(organizationId, id);
  const rows = (await orgMemberships(organizationId)).filter((m) => m.workspaceId === workspaceId && m.role === ref.role);
  return toGroup(displayName, rows);
}

/** Member ids from a SCIM Group resource, tolerating both `value` and bare strings. */
export function memberIdsOf(resource: Record<string, unknown>): string[] {
  const raw = Array.isArray(resource.members) ? resource.members : [];
  const ids = raw.map((m) => (typeof m === "string" ? m : (m as { value?: unknown })?.value));
  return [...new Set(ids.filter((v): v is string => typeof v === "string" && Boolean(v)))];
}

/**
 * Sets the exact membership of one workspace role from the IdP's list. Users
 * the IdP has not provisioned into this organization are rejected rather than
 * silently granted access.
 */
export async function setGroupMembers(ctx: ScimContext, id: string, memberIds: string[]): Promise<GroupResource> {
  const { ref, workspaceId, displayName } = await resolveGroup(ctx.organizationId, id);
  const known = memberIds.length
    ? await db
        .select({ userId: scimIdentity.userId })
        .from(scimIdentity)
        .where(and(eq(scimIdentity.organizationId, ctx.organizationId), inArray(scimIdentity.userId, memberIds)))
    : [];
  const missing = memberIds.filter((mid) => !known.some((k) => k.userId === mid));
  if (missing.length) throw new ScimError(400, `Not provisioned in this organization: ${missing.join(", ")}`, "invalidValue");

  const current = (await orgMemberships(ctx.organizationId)).filter((m) => m.workspaceId === workspaceId && m.role === ref.role);
  const added = memberIds.filter((mid) => !current.some((c) => c.userId === mid));
  const removed = current.filter((c) => !memberIds.includes(c.userId)).map((c) => c.userId);
  await writeMembership(ctx.organizationId, workspaceId, ref.role, added, removed);
  await audit({
    action: "scim.group.updated",
    organizationId: ctx.organizationId,
    workspaceId,
    targetType: "workspace_membership",
    targetId: displayName,
    summary: { after: { added, removed, role: ref.role }, note: `scim token ${ctx.tokenId}` },
  });
  return getGroup(ctx.organizationId, id);
}

async function writeMembership(organizationId: string, workspaceId: string, role: WorkspaceRole, added: string[], removed: string[]) {
  for (const userId of added) {
    await db
      .insert(workspaceMembership)
      .values({ organizationId, workspaceId, userId, role })
      .onConflictDoUpdate({ target: [workspaceMembership.workspaceId, workspaceMembership.userId], set: { role } });
  }
  if (removed.length) {
    await db
      .delete(workspaceMembership)
      .where(and(eq(workspaceMembership.workspaceId, workspaceId), eq(workspaceMembership.role, role), inArray(workspaceMembership.userId, removed)));
  }
}
