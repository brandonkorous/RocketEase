"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { apiKey } from "@/db/schema/api";
import { mintApiKey, rejectedScopes, resolveScopes } from "@/lib/api/keys";
import { API_SCOPE_KEYS } from "@/lib/api/scopes";
import { audit } from "@/lib/audit";
import { requireCapability } from "@/lib/session";
import { workspacePath } from "@/lib/nav";
import { fail, guard, type ActionState } from "../content/shared";

const refresh = (workspaceId: string) => revalidatePath(workspacePath(workspaceId, "settings/api"));

const createSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().trim().min(1, "Name the key so you know what to revoke.").max(80),
  scopes: z.array(z.string()).min(1, "Choose at least one scope."),
});

/**
 * Mints a workspace-scoped API key. Scopes are intersected with the creator's
 * own capabilities, so a key can never do more than the person who made it —
 * and only the capabilities /api/v1 uses are on offer. The plaintext is
 * returned exactly once.
 */
export async function createApiKey(input: z.infer<typeof createSchema>): Promise<ActionState & { token?: string; prefix?: string }> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid key");
  const { workspaceId, name, scopes } = parsed.data;
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "workspace.settings");
    const wanted = scopes.filter((s) => (API_SCOPE_KEYS as string[]).includes(s));
    const principal = { role: ctx.workspace.role, grants: ctx.workspace.grants };
    const granted = resolveScopes(wanted, principal);
    if (!granted.length) return fail("None of those scopes are yours to give.");
    const refused = rejectedScopes(wanted, principal);
    const { raw, hash, prefix } = mintApiKey();
    const [row] = await db
      .insert(apiKey)
      .values({ organizationId: ctx.workspace.organizationId, workspaceId, name, keyHash: hash, prefix, scopes: granted, createdByUserId: ctx.session.user.id })
      .returning({ id: apiKey.id });
    await audit({ action: "api_key.create", actorUserId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId, targetType: "api_key", targetId: row.id, summary: { after: { name, prefix, scopes: granted } } });
    refresh(workspaceId);
    const note = refused.length ? ` ${refused.length} scope${refused.length === 1 ? "" : "s"} you don't hold ${refused.length === 1 ? "was" : "were"} dropped.` : "";
    return { ok: `Key created. Copy it now — it isn't shown again.${note}`, token: raw, prefix };
  });
}

export async function revokeApiKey(input: { workspaceId: string; keyId: string }): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(input.workspaceId, "workspace.settings");
    const [row] = await db
      .update(apiKey)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiKey.id, input.keyId), eq(apiKey.workspaceId, input.workspaceId), isNull(apiKey.revokedAt)))
      .returning({ prefix: apiKey.prefix, name: apiKey.name });
    if (!row) return fail("That key is already revoked.");
    await audit({ action: "api_key.revoke", actorUserId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId: input.workspaceId, targetType: "api_key", targetId: input.keyId, summary: { before: { name: row.name, prefix: row.prefix } } });
    refresh(input.workspaceId);
    return { ok: "Key revoked. Requests using it fail immediately." };
  });
}
