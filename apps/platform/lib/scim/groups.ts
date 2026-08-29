import { WORKSPACE_ROLES, type WorkspaceRole } from "@/db/schema/app";

/**
 * A SCIM Group is one workspace role preset: `rke:<workspaceSlug>:<role>`.
 * Adding a user to `rke:acme:manager` gives them the manager preset in the
 * Acme workspace; removing them takes it away. The prefix keeps our groups
 * distinguishable from every other group an IdP might push.
 */
export const GROUP_PREFIX = "rke";

export type GroupRef = { workspaceSlug: string; role: WorkspaceRole };

const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const ROLES = new Set<string>(WORKSPACE_ROLES);

/** Canonical display name for a workspace + role pair. */
export function groupDisplayName(workspaceSlug: string, role: WorkspaceRole): string {
  return `${GROUP_PREFIX}:${workspaceSlug}:${role}`;
}

/**
 * Parses a group display name. Returns null for anything that isn't one of
 * ours — an IdP pushing its own groups must not silently grant access.
 */
export function parseGroupName(displayName: string): GroupRef | null {
  if (typeof displayName !== "string") return null;
  const parts = displayName.trim().toLowerCase().split(":");
  if (parts.length !== 3) return null;
  const [prefix, workspaceSlug, role] = parts;
  if (prefix !== GROUP_PREFIX || !SLUG.test(workspaceSlug) || !ROLES.has(role)) return null;
  return { workspaceSlug, role: role as WorkspaceRole };
}

/** The group id is its display name — stable, readable, and needs no table. */
export const groupIdFor = (displayName: string) => displayName.trim().toLowerCase();

/** Every group an organization exposes: one per workspace, per role preset. */
export function groupsForWorkspaces(slugs: string[]): string[] {
  return slugs.flatMap((slug) => WORKSPACE_ROLES.map((role) => groupDisplayName(slug, role)));
}
