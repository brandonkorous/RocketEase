"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { scimToken } from "@/db/schema/app";
import { audit } from "@/lib/audit";
import { requireOrgAdmin } from "@/lib/org-admin";
import { workspacePath } from "@/lib/nav";
import { mintScimToken } from "@/lib/scim/token";
import { fail, guard, type ActionState } from "../content/shared";

const refresh = (workspaceId: string) => revalidatePath(workspacePath(workspaceId, "settings/sso"));

/**
 * Issues a provisioning token and revokes any previous one — rotation and
 * first issue are the same operation, so there is never more than one live
 * credential per organization. The plaintext is returned exactly once.
 */
export async function rotateScimToken(input: { workspaceId: string }): Promise<ActionState & { token?: string; prefix?: string }> {
  return guard(async () => {
    const ctx = await requireOrgAdmin(input.workspaceId);
    const orgId = ctx.workspace.organizationId;
    const { raw, hash, prefix } = mintScimToken();
    const existing = await db
      .select({ id: scimToken.id })
      .from(scimToken)
      .where(and(eq(scimToken.organizationId, orgId), isNull(scimToken.revokedAt)));
    await db.transaction(async (tx) => {
      await tx
        .update(scimToken)
        .set({ revokedAt: new Date() })
        .where(and(eq(scimToken.organizationId, orgId), isNull(scimToken.revokedAt)));
      await tx.insert(scimToken).values({ organizationId: orgId, tokenHash: hash, prefix, createdByUserId: ctx.session.user.id });
    });
    await audit({
      action: "scim.token.rotate",
      actorUserId: ctx.session.user.id,
      organizationId: orgId,
      workspaceId: input.workspaceId,
      targetType: "scim_token",
      targetId: prefix,
      summary: { after: { prefix }, note: existing.length ? `revoked ${existing.length} previous token(s)` : "first token" },
    });
    refresh(input.workspaceId);
    return { ok: "Provisioning token created. Copy it now — it isn't shown again.", token: raw, prefix };
  });
}

/** Turns provisioning off without touching anything already provisioned. */
export async function revokeScimToken(input: { workspaceId: string }): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireOrgAdmin(input.workspaceId);
    const orgId = ctx.workspace.organizationId;
    const rows = await db
      .update(scimToken)
      .set({ revokedAt: new Date() })
      .where(and(eq(scimToken.organizationId, orgId), isNull(scimToken.revokedAt)))
      .returning({ prefix: scimToken.prefix });
    if (!rows.length) return fail("There's no active provisioning token to revoke.");
    await audit({
      action: "scim.token.rotate",
      actorUserId: ctx.session.user.id,
      organizationId: orgId,
      workspaceId: input.workspaceId,
      targetType: "scim_token",
      targetId: rows[0].prefix,
      summary: { note: "revoked" },
    });
    refresh(input.workspaceId);
    return { ok: "Provisioning token revoked." };
  });
}
