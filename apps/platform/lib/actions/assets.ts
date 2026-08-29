"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { RIGHTS_SCOPES, asset, tag, type AssetKind } from "@/db/schema/assets";
import { audit } from "@/lib/audit";
import { AuthorizationError } from "@/lib/authz";
import { emit } from "@/lib/jobs/outbox";
import { headObject, newObjectKey, presignUpload } from "@/lib/storage";
import { requireCapability } from "@/lib/session";
import { workspacePath } from "@/lib/nav";

export type ActionState = { error?: string; ok?: string };
const fail = (error: string): ActionState => ({ error });
const guard = async <T>(fn: () => Promise<T>): Promise<T | ActionState> => {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AuthorizationError) return fail("You don't have permission to manage the content library.");
    throw e;
  }
};

const MAX_BYTES: Record<AssetKind, number> = { image: 30 * 1024 * 1024, video: 2 * 1024 * 1024 * 1024, document: 50 * 1024 * 1024 };
const ALLOWED: Record<string, AssetKind> = {
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
  "image/gif": "image",
  "video/mp4": "video",
  "video/quicktime": "video",
  "video/webm": "video",
  "application/pdf": "document",
};

/** Step 1 of upload: reserve a row + presigned PUT. The browser uploads directly to storage. */
export async function beginUpload(input: { workspaceId: string; fileName: string; mimeType: string; bytes: number }) {
  const parsed = z.object({ workspaceId: z.string().min(1), fileName: z.string().min(1).max(255), mimeType: z.string(), bytes: z.number().int().positive() }).safeParse(input);
  if (!parsed.success) return fail("Invalid upload");
  const { workspaceId, fileName, mimeType, bytes } = parsed.data;
  const kind = ALLOWED[mimeType];
  if (!kind) return fail(`${mimeType || "That file type"} isn't supported. Use JPG, PNG, WebP, GIF, MP4, MOV, WebM, or PDF.`);
  if (bytes > MAX_BYTES[kind]) return fail(`That ${kind} is too large (limit ${Math.round(MAX_BYTES[kind] / 1024 / 1024)} MB).`);

  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "content.create");
    const key = newObjectKey(ctx.workspace.organizationId, workspaceId, "original", fileName);
    const [row] = await db
      .insert(asset)
      .values({ organizationId: ctx.workspace.organizationId, workspaceId, kind, storageKey: key, fileName, mimeType, bytes, title: fileName.replace(/\.[^.]+$/, ""), uploadedByUserId: ctx.session.user.id })
      .returning({ id: asset.id });
    const upload = await presignUpload(key, mimeType, MAX_BYTES[kind]);
    return { assetId: row.id, upload };
  });
}

/** Step 2: browser finished the PUT. Verify the object exists, then queue processing (renditions + scan). */
export async function completeUpload(workspaceId: string, assetId: string): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "content.create");
    const row = await db.query.asset.findFirst({ where: (a, { and, eq }) => and(eq(a.id, assetId), eq(a.workspaceId, workspaceId)) });
    if (!row) return fail("Upload not found.");
    const head = await headObject(row.storageKey);
    if (!head) {
      await db.update(asset).set({ uploadStatus: "failed", processingError: "Object missing after upload" }).where(eq(asset.id, row.id));
      return fail("The file didn't arrive in storage. Try again.");
    }
    await db.transaction(async (tx) => {
      await tx.update(asset).set({ uploadStatus: "processing", bytes: head.bytes, updatedAt: new Date() }).where(eq(asset.id, row.id));
      await emit(tx, "asset.process", { assetId: row.id }, { organizationId: row.organizationId, workspaceId, dedupeKey: `asset.process:${row.id}` });
    });
    await audit({ action: "asset.upload", actorUserId: ctx.session.user.id, organizationId: row.organizationId, workspaceId, targetType: "asset", targetId: row.id, summary: { after: { fileName: row.fileName, kind: row.kind, bytes: head.bytes } } });
    revalidatePath(workspacePath(workspaceId, "content"));
    return { ok: "Uploaded" };
  });
}

const metaSchema = z.object({
  workspaceId: z.string(),
  assetId: z.string(),
  title: z.string().trim().max(200).optional(),
  altText: z.string().trim().max(1000).optional(),
  caption: z.string().trim().max(2200).optional(),
  tags: z.string().optional(),
  rightsNote: z.string().trim().max(500).optional(),
  rightsExpiresAt: z.string().optional(),
  rightsScope: z.enum(RIGHTS_SCOPES).optional(),
});

export async function updateAsset(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = metaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Check the form");
  const { workspaceId, assetId, tags, rightsExpiresAt, ...fields } = parsed.data;
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "content.edit");
    const row = await db.query.asset.findFirst({ where: (a, { and, eq }) => and(eq(a.id, assetId), eq(a.workspaceId, workspaceId)) });
    if (!row) return fail("Asset not found.");

    // Tags: upsert by name within the workspace.
    const names = [...new Set((tags ?? "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20);
    const tagIds: string[] = [];
    for (const name of names) {
      const [t] = await db.insert(tag).values({ organizationId: row.organizationId, workspaceId, name }).onConflictDoUpdate({ target: [tag.workspaceId, tag.name], set: { name } }).returning({ id: tag.id });
      tagIds.push(t.id);
    }
    await db
      .update(asset)
      .set({ ...fields, tagIds, rightsExpiresAt: rightsExpiresAt ? new Date(rightsExpiresAt) : null, updatedAt: new Date() })
      .where(eq(asset.id, row.id));
    await audit({ action: "asset.update", actorUserId: ctx.session.user.id, organizationId: row.organizationId, workspaceId, targetType: "asset", targetId: row.id, summary: { after: { ...fields, tags: names } } });
    revalidatePath(workspacePath(workspaceId, "content"));
    return { ok: "Saved." };
  });
}

/** Soft delete. Blocked when referenced by scheduled/published work (wired when post variants exist, M2). */
export async function deleteAsset(workspaceId: string, assetId: string): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "content.edit");
    const row = await db.query.asset.findFirst({ where: (a, { and, eq, isNull }) => and(eq(a.id, assetId), eq(a.workspaceId, workspaceId), isNull(a.deletedAt)) });
    if (!row) return fail("Asset not found.");
    const refs = await assetReferences(row.id);
    if (refs > 0) return fail(`This asset is used by ${refs} scheduled or published post${refs === 1 ? "" : "s"}. Remove it from those first.`);
    await db.update(asset).set({ deletedAt: new Date(), updatedAt: new Date() }).where(and(eq(asset.id, row.id), isNull(asset.deletedAt)));
    await audit({ action: "asset.delete", actorUserId: ctx.session.user.id, organizationId: row.organizationId, workspaceId, targetType: "asset", targetId: row.id, summary: { before: { fileName: row.fileName } } });
    revalidatePath(workspacePath(workspaceId, "content"));
    return { ok: "Moved to trash. Storage is reclaimed after 30 days." };
  });
}

/** Usage references — post variants arrive in M2; until then nothing references assets. */
async function assetReferences(_assetId: string): Promise<number> {
  return 0;
}
