"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { PublishFormat } from "@make-it-social/providers";
import { db } from "@/db";
import { asset } from "@/db/schema/assets";
import { contentItem, postVariant } from "@/db/schema/content";
import { audit } from "@/lib/audit";
import { track } from "@/lib/telemetry";
import { inferFormat, summarizeItem, validateVariant } from "@/lib/content";
import { requireCapability } from "@/lib/session";
import { workspacePath } from "@/lib/nav";
import { fail, guard, type ActionState } from "./shared";

const FORMATS = ["text", "image", "carousel", "video", "reel", "story", "document"] as const satisfies readonly PublishFormat[];
const variantSchema = z.object({
  format: z.enum(FORMATS).optional(), textOverride: z.string().max(10_000).nullable().optional(), assetIdsOverride: z.array(z.string()).nullable().optional(),
  firstComment: z.string().max(2200).nullable().optional(), linkOverride: z.string().max(2048).nullable().optional(), settings: z.record(z.string(), z.unknown()).optional(),
});
const draftSchema = z.object({
  workspaceId: z.string().min(1), itemId: z.string().min(1), title: z.string().trim().max(200).optional(), sharedText: z.string().max(10_000).default(""),
  sharedAssetIds: z.array(z.string()).max(35).default([]), link: z.string().trim().url().max(2048).nullable().optional().or(z.literal("")),
  channelIds: z.array(z.string()).max(20).default([]), variants: z.record(z.string(), variantSchema).default({}),
});
export type DraftInput = z.input<typeof draftSchema>;
type Draft = z.output<typeof draftSchema>;
const EDITABLE = ["draft", "scheduled", "failed", "canceled"] as const;

export async function createDraft(workspaceId: string): Promise<{ itemId: string } | ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "content.create");
    const [row] = await db.insert(contentItem).values({ organizationId: ctx.workspace.organizationId, workspaceId, ownerUserId: ctx.session.user.id, createdByUserId: ctx.session.user.id }).returning({ id: contentItem.id });
    await audit({ action: "content.create", actorUserId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId, targetType: "content_item", targetId: row.id });
    await track("draft_created", { userId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId, surface: "action:createDraft" });
    return { itemId: row.id };
  });
}

/** Autosave: reconcile variants with selected channels, store overrides, re-validate. */
export async function saveDraft(input: DraftInput) {
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid draft");
  const d = parsed.data;
  return guard(async () => {
    await requireCapability(d.workspaceId, "content.edit");
    const item = await db.query.contentItem.findFirst({ where: (c, { and, eq, isNull }) => and(eq(c.id, d.itemId), eq(c.workspaceId, d.workspaceId), isNull(c.deletedAt)) });
    if (!item) return fail("Draft not found.");
    if (["publishing", "published"].includes(item.status)) return fail("Published posts can't be edited. Duplicate it instead.");
    const sharedAssetIds = await ownedAssetIds(d.workspaceId, d.sharedAssetIds);
    const assetRows = sharedAssetIds.length ? await db.select({ id: asset.id, kind: asset.kind }).from(asset).where(inArray(asset.id, sharedAssetIds)) : [];
    await db.transaction(async (tx) => {
      const approvalState = item.approvalState === "approved" ? "superseded" : item.approvalState;
      await tx.update(contentItem).set({ title: d.title || item.title, sharedText: d.sharedText, sharedAssetIds, link: d.link ? d.link : null, approvalState, updatedAt: new Date() }).where(eq(contentItem.id, item.id));
      const stale = d.channelIds.length ? and(eq(postVariant.contentItemId, item.id), notInArray(postVariant.channelId, d.channelIds), inArray(postVariant.status, EDITABLE)) : and(eq(postVariant.contentItemId, item.id), inArray(postVariant.status, EDITABLE));
      await tx.delete(postVariant).where(stale);
      for (const channelId of d.channelIds) await upsertVariant(tx, item, d, channelId, assetRows);
    });
    const fresh = await db.query.contentItem.findFirst({ where: (c, { eq }) => eq(c.id, item.id) });
    const variants = await db.select().from(postVariant).where(eq(postVariant.contentItemId, item.id));
    const validation: Record<string, Awaited<ReturnType<typeof validateVariant>>> = {};
    for (const v of variants) validation[v.channelId] = await validateVariant(fresh!, v);
    await summarizeItem(item.id);
    return { ok: "Saved", savedAt: new Date().toISOString(), validation, formats: Object.fromEntries(variants.map((v) => [v.channelId, v.format])) };
  });
}

async function ownedAssetIds(workspaceId: string, ids: string[]) {
  if (!ids.length) return [];
  const rows = await db.select({ id: asset.id }).from(asset).where(and(inArray(asset.id, ids), eq(asset.workspaceId, workspaceId)));
  const ok = new Set(rows.map((a) => a.id));
  return ids.filter((id) => ok.has(id));
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function upsertVariant(tx: Tx, item: { id: string; organizationId: string }, d: Draft, channelId: string, assetRows: { id: string; kind: string }[]) {
  const ov = d.variants[channelId] ?? {};
  const forFormat = ov.assetIdsOverride ? assetRows.filter((a) => ov.assetIdsOverride!.includes(a.id)) : assetRows;
  const values = { format: inferFormat(forFormat, ov.format), textOverride: ov.textOverride ?? null, assetIdsOverride: ov.assetIdsOverride ?? null, firstComment: ov.firstComment ?? null, linkOverride: ov.linkOverride ?? null, settings: ov.settings ?? {} };
  await tx
    .insert(postVariant)
    .values({ organizationId: item.organizationId, workspaceId: d.workspaceId, contentItemId: item.id, channelId, ...values })
    .onConflictDoUpdate({ target: [postVariant.contentItemId, postVariant.channelId], set: { ...values, updatedAt: new Date() }, setWhere: sql`${postVariant.status} in ('draft','scheduled','failed','canceled')` });
}

export async function deleteDraft(workspaceId: string, itemId: string): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "content.edit");
    const item = await db.query.contentItem.findFirst({ where: (c, { and, eq }) => and(eq(c.id, itemId), eq(c.workspaceId, workspaceId)) });
    if (!item) return fail("Post not found.");
    if (["scheduled", "publishing", "published", "partially_published"].includes(item.status)) return fail("Unschedule it first; published posts are kept for history.");
    await db.update(contentItem).set({ deletedAt: new Date(), status: "canceled", updatedAt: new Date() }).where(eq(contentItem.id, item.id));
    await audit({ action: "content.delete", actorUserId: ctx.session.user.id, organizationId: item.organizationId, workspaceId, targetType: "content_item", targetId: item.id });
    revalidatePath(workspacePath(workspaceId, "calendar"));
    return { ok: "Draft deleted." };
  });
}

/** Duplicate as a traceable child (content-model.md "Templates and reuse"). */
export async function duplicateItem(workspaceId: string, itemId: string): Promise<ActionState | { itemId: string }> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "content.create");
    const item = await db.query.contentItem.findFirst({ where: (c, { and, eq }) => and(eq(c.id, itemId), eq(c.workspaceId, workspaceId)) });
    if (!item) return fail("Post not found.");
    const vs = await db.select().from(postVariant).where(eq(postVariant.contentItemId, item.id));
    const newId = await db.transaction(async (tx) => {
      const [row] = await tx.insert(contentItem).values({ organizationId: item.organizationId, workspaceId, title: `${item.title} (copy)`, sharedText: item.sharedText, sharedAssetIds: item.sharedAssetIds, link: item.link, tagIds: item.tagIds, ownerUserId: ctx.session.user.id, createdByUserId: ctx.session.user.id }).returning({ id: contentItem.id });
      for (const v of vs) await tx.insert(postVariant).values({ organizationId: item.organizationId, workspaceId, contentItemId: row.id, channelId: v.channelId, format: v.format, textOverride: v.textOverride, assetIdsOverride: v.assetIdsOverride, firstComment: v.firstComment, linkOverride: v.linkOverride, settings: v.settings });
      return row.id;
    });
    await audit({ action: "content.duplicate", actorUserId: ctx.session.user.id, organizationId: item.organizationId, workspaceId, targetType: "content_item", targetId: newId, summary: { note: `from ${item.id}` } });
    return { itemId: newId };
  });
}

export async function goToNewDraft(workspaceId: string) {
  const r = await createDraft(workspaceId);
  redirect(workspacePath(workspaceId, "itemId" in r ? `create?item=${r.itemId}` : "create?error=forbidden"));
}
