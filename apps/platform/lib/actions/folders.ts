"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { asset, folder } from "@/db/schema/assets";
import { audit } from "@/lib/audit";
import { AuthorizationError } from "@/lib/authz";
import { requireCapability } from "@/lib/session";
import { workspacePath } from "@/lib/nav";

export type ActionState = { error?: string; ok?: string };
const fail = (error: string): ActionState => ({ error });
const guard = async <T>(fn: () => Promise<T>): Promise<T | ActionState> => {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AuthorizationError) return fail("You don't have permission to manage collections.");
    throw e;
  }
};

export async function createFolder(workspaceId: string, name: string): Promise<ActionState> {
  const parsed = z.string().trim().min(1, "Give the collection a name").max(80).safeParse(name);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "content.edit");
    const [row] = await db.insert(folder).values({ organizationId: ctx.workspace.organizationId, workspaceId, name: parsed.data }).returning({ id: folder.id });
    await audit({ action: "folder.create", actorUserId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId, targetType: "folder", targetId: row.id, summary: { after: { name: parsed.data } } });
    revalidatePath(workspacePath(workspaceId, "content"));
    return { ok: "Collection created." };
  });
}

export async function moveAssets(workspaceId: string, assetIds: string[], folderId: string | null): Promise<ActionState> {
  if (!assetIds.length) return fail("Select at least one asset.");
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "content.edit");
    if (folderId) {
      const f = await db.query.folder.findFirst({ where: (x, { and, eq }) => and(eq(x.id, folderId), eq(x.workspaceId, workspaceId)) });
      if (!f) return fail("Collection not found.");
    }
    await db.update(asset).set({ folderId, updatedAt: new Date() }).where(and(inArray(asset.id, assetIds), eq(asset.workspaceId, workspaceId)));
    await audit({ action: "asset.move", actorUserId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId, targetType: "folder", targetId: folderId ?? "root", summary: { after: { assetIds } } });
    revalidatePath(workspacePath(workspaceId, "content"));
    return { ok: `Moved ${assetIds.length} asset${assetIds.length === 1 ? "" : "s"}.` };
  });
}
