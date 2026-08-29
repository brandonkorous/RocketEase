"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { GRANT_KINDS, RIGHTS_SCOPES, authorizationGrant } from "@/db/schema/rights";
import { audit } from "@/lib/audit";
import { workspacePath } from "@/lib/nav";
import { requireCapability } from "@/lib/session";
import { fail, guard, type ActionState } from "../content/shared";

const dateish = z.string().trim().max(40).optional();
const schema = z.object({
  workspaceId: z.string().min(1),
  id: z.string().optional(),
  kind: z.enum(GRANT_KINDS),
  scope: z.enum(RIGHTS_SCOPES),
  label: z.string().trim().min(1, "Give the authorisation a name.").max(140),
  assetId: z.string().trim().max(64).optional(),
  channelId: z.string().trim().max(64).optional(),
  creatorHandle: z.string().trim().max(80).optional(),
  startsAt: dateish,
  expiresAt: dateish,
  reference: z.string().trim().max(300).optional(),
  note: z.string().trim().max(1000).optional(),
});
export type GrantInput = z.input<typeof schema>;

const asDate = (v?: string) => (v ? new Date(v.length === 10 ? `${v}T00:00:00.000Z` : v) : null);
const nullable = (v?: string) => (v && v.length ? v : null);

/** Create or update one authorisation grant. Every clock change is audited. */
export async function saveGrant(input: GrantInput): Promise<ActionState> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the authorisation fields.");
  const { workspaceId, id, ...v } = parsed.data;
  const expiresAt = asDate(v.expiresAt);
  const startsAt = asDate(v.startsAt);
  if (startsAt && expiresAt && expiresAt <= startsAt) return fail("The expiry must be after the start date.");
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "content.edit");
    const values = {
      kind: v.kind, scope: v.scope, label: v.label, assetId: nullable(v.assetId), channelId: nullable(v.channelId),
      creatorHandle: nullable(v.creatorHandle), startsAt, expiresAt, reference: nullable(v.reference), note: nullable(v.note),
    };
    const existing = id ? await db.query.authorizationGrant.findFirst({ where: (g, { and, eq }) => and(eq(g.id, id), eq(g.workspaceId, workspaceId)) }) : null;
    if (id && !existing) return fail("That authorisation no longer exists.");
    const targetId = existing
      ? (await db.update(authorizationGrant).set({ ...values, updatedAt: new Date() }).where(eq(authorizationGrant.id, existing.id)).returning({ id: authorizationGrant.id }))[0].id
      : (await db.insert(authorizationGrant).values({ organizationId: ctx.workspace.organizationId, workspaceId, ...values, createdByUserId: ctx.session.user.id }).returning({ id: authorizationGrant.id }))[0].id;
    await audit({ action: existing ? "rights.grant.update" : "rights.grant.create", actorUserId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId, targetType: "authorization_grant", targetId, summary: { before: existing ?? undefined, after: values } });
    revalidatePath(workspacePath(workspaceId, "settings/rights"));
    return { ok: existing ? "Authorisation updated." : "Authorisation recorded." };
  });
}

/** Revoke: the clock stops now and anything relying on it is blocked from that moment. */
export async function revokeGrant(workspaceId: string, grantId: string): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "content.edit");
    const [row] = await db
      .update(authorizationGrant)
      .set({ revokedAt: new Date(), revokedByUserId: ctx.session.user.id, updatedAt: new Date() })
      .where(and(eq(authorizationGrant.id, grantId), eq(authorizationGrant.workspaceId, workspaceId)))
      .returning({ id: authorizationGrant.id, label: authorizationGrant.label });
    if (!row) return fail("That authorisation no longer exists.");
    await audit({ action: "rights.grant.revoke", actorUserId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId, targetType: "authorization_grant", targetId: row.id, summary: { after: { revoked: true, label: row.label } } });
    revalidatePath(workspacePath(workspaceId, "settings/rights"));
    return { ok: `"${row.label}" revoked. Posts and promotions that rely on it are now blocked.` };
  });
}
