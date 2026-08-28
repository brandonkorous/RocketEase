import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { scimIdentity, workspace, workspaceMembership } from "@/db/schema/app";
import { member, session, user } from "@/db/schema/auth";
import { audit } from "@/lib/audit";
import { ScimError } from "./errors";
import type { ScimContext } from "./auth";
import { emailOf, externalIdOf, joinName, requireUserName, scimActive } from "./resource";
import { findUser, findUserByName, type UserRow } from "./users";

async function scimAudit(ctx: ScimContext, action: string, userId: string, summary: Record<string, unknown>) {
  await audit({
    action,
    organizationId: ctx.organizationId,
    targetType: "user",
    targetId: userId,
    summary: { after: summary, note: `scim token ${ctx.tokenId}` },
  });
}

/** Creates the platform user when the IdP is provisioning someone brand new. */
async function upsertPlatformUser(email: string, name: string): Promise<string> {
  const existing = await db.query.user.findFirst({ where: eq(user.email, email), columns: { id: true } });
  if (existing) return existing.id;
  const id = randomUUID();
  await db.insert(user).values({ id, email, name: name || email, emailVerified: true });
  return id;
}

async function ensureOrgMember(organizationId: string, userId: string) {
  const existing = await db.query.member.findFirst({
    where: and(eq(member.organizationId, organizationId), eq(member.userId, userId)),
    columns: { id: true },
  });
  if (existing) return;
  await db.insert(member).values({ id: randomUUID(), organizationId, userId, role: "member", createdAt: new Date() });
}

/** POST /Users. Idempotent per RFC only in the sense that a repeat is a 409. */
export async function createScimUser(ctx: ScimContext, payload: Record<string, unknown>): Promise<UserRow> {
  const userName = requireUserName(payload);
  if (await findUserByName(ctx.organizationId, userName)) {
    throw new ScimError(409, `A user with userName ${userName} already exists`, "uniqueness");
  }
  const name = joinName(payload);
  const email = emailOf(payload, userName);
  const userId = await upsertPlatformUser(email, name);
  await ensureOrgMember(ctx.organizationId, userId);
  await db.insert(scimIdentity).values({
    organizationId: ctx.organizationId,
    userId,
    userName,
    externalId: externalIdOf(payload),
    active: scimActive(payload),
    lastSyncedAt: new Date(),
  });
  await scimAudit(ctx, "scim.user.provisioned", userId, { userName, created: true });
  const row = await findUser(ctx.organizationId, userId);
  if (!row) throw new ScimError(500, "User was not persisted");
  return row;
}

/**
 * Deactivation is the deprovision path: sessions are revoked immediately and
 * every workspace membership in this organization is marked inactive, so the
 * next request from a stale cookie finds nothing to enter.
 */
async function setActive(ctx: ScimContext, userId: string, active: boolean) {
  const deactivatedAt = active ? null : new Date();
  await db
    .update(workspaceMembership)
    .set({ deactivatedAt })
    .where(and(eq(workspaceMembership.organizationId, ctx.organizationId), eq(workspaceMembership.userId, userId)));
  if (!active) await db.delete(session).where(eq(session.userId, userId));
}

/**
 * Writes a merged SCIM User resource back onto our tables (PUT and PATCH share
 * this). An omitted `active` keeps the current state: silently reactivating a
 * leaver because the IdP left the field out is the worse failure.
 */
export async function applyScimUser(ctx: ScimContext, current: UserRow, resource: Record<string, unknown>): Promise<UserRow> {
  const userName = requireUserName(resource);
  if (userName !== current.userName) {
    const clash = await findUserByName(ctx.organizationId, userName);
    if (clash && clash.userId !== current.userId) throw new ScimError(409, "userName is taken", "uniqueness");
  }
  const active = scimActive(resource, current.active);
  const name = joinName(resource) || current.name;
  if (name !== current.name) await db.update(user).set({ name }).where(eq(user.id, current.userId));
  await db
    .update(scimIdentity)
    .set({ userName, externalId: externalIdOf(resource), active, lastSyncedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(scimIdentity.organizationId, ctx.organizationId), eq(scimIdentity.userId, current.userId)));
  if (active !== current.active) await setActive(ctx, current.userId, active);
  await scimAudit(ctx, active ? "scim.user.provisioned" : "scim.user.deprovisioned", current.userId, { userName, active });
  const row = await findUser(ctx.organizationId, current.userId);
  if (!row) throw new ScimError(500, "User was not persisted");
  return row;
}

/** DELETE /Users/{id} — deprovision without destroying the audit trail. */
export async function deactivateScimUser(ctx: ScimContext, current: UserRow): Promise<void> {
  await db
    .update(scimIdentity)
    .set({ active: false, lastSyncedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(scimIdentity.organizationId, ctx.organizationId), eq(scimIdentity.userId, current.userId)));
  await setActive(ctx, current.userId, false);
  await scimAudit(ctx, "scim.user.deprovisioned", current.userId, { userName: current.userName, deleted: true });
}

/** Workspaces the token's organization owns, by slug. */
export async function orgWorkspaces(organizationId: string) {
  return db
    .select({ id: workspace.id, slug: workspace.slug, name: workspace.name })
    .from(workspace)
    .where(eq(workspace.organizationId, organizationId))
    .orderBy(workspace.slug);
}
