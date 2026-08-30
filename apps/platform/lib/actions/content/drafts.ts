"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { PublishFormat } from "@rocketease/providers";
import { db } from "@/db";
import { asset } from "@/db/schema/assets";
import { SYNTHETIC_FLAGS, contentItem, postVariant, type SyntheticMedia } from "@/db/schema/content";
import { audit } from "@/lib/audit";
import { track } from "@/lib/telemetry";
import { inferFormat, summarizeItem, validateVariant } from "@/lib/content";
import { createContentItem, ownedAssetIds } from "@/lib/authoring";
import { deriveTitle, isAutoTitle } from "@/lib/content-title";
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
  syntheticFlag: z.enum(SYNTHETIC_FLAGS).optional(), syntheticNote: z.string().trim().max(280).optional(),
});
export type DraftInput = z.input<typeof draftSchema>;
type Draft = z.output<typeof draftSchema>;
const EDITABLE = ["draft", "scheduled", "failed", "canceled"] as const;

export async function createDraft(workspaceId: string): Promise<{ itemId: string } | ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "content.create");
    const actor = { userId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId };
    const { item } = await createContentItem(actor, {}, "action:createDraft");
    return { itemId: item.id };
  });
}

/** Autosave: reconcile variants with selected channels, store overrides, re-validate. */
export async function saveDraft(input: DraftInput) {
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid draft");
  const d = parsed.data;
  return guard(async () => {
    const ctx = await requireCapability(d.workspaceId, "content.edit");
    const item = await db.query.contentItem.findFirst({ where: (c, { and, eq, isNull }) => and(eq(c.id, d.itemId), eq(c.workspaceId, d.workspaceId), isNull(c.deletedAt)) });
    if (!item) return fail("Draft not found.");
    if (["publishing", "published"].includes(item.status)) return fail("Published posts can't be edited. Duplicate it instead.");
    const disclosure = nextDisclosure(item.syntheticMedia, d, ctx.session.user.id);
    const sharedAssetIds = await ownedAssetIds(d.workspaceId, d.sharedAssetIds);
    const assetRows = sharedAssetIds.length ? await db.select({ id: asset.id, kind: asset.kind }).from(asset).where(inArray(asset.id, sharedAssetIds)) : [];
    await db.transaction(async (tx) => {
      const approvalState = item.approvalState === "approved" ? "superseded" : item.approvalState;
      // Keep an auto-derived name tracking the text; never touch one a person set.
      const title = d.title || (isAutoTitle(item.title, item.sharedText) ? deriveTitle(d.sharedText) : item.title);
      await tx.update(contentItem).set({ title, sharedText: d.sharedText, sharedAssetIds, link: d.link ? d.link : null, approvalState, ...(disclosure ? { syntheticMedia: disclosure } : {}), updatedAt: new Date() }).where(eq(contentItem.id, item.id));
      const stale = d.channelIds.length ? and(eq(postVariant.contentItemId, item.id), notInArray(postVariant.channelId, d.channelIds), inArray(postVariant.status, EDITABLE)) : and(eq(postVariant.contentItemId, item.id), inArray(postVariant.status, EDITABLE));
      await tx.delete(postVariant).where(stale);
      for (const channelId of d.channelIds) await upsertVariant(tx, item, d, channelId, assetRows);
    });
    const fresh = await db.query.contentItem.findFirst({ where: (c, { eq }) => eq(c.id, item.id) });
    const variants = await db.select().from(postVariant).where(eq(postVariant.contentItemId, item.id));
    const validation: Record<string, Awaited<ReturnType<typeof validateVariant>>> = {};
    for (const v of variants) validation[v.channelId] = await validateVariant(fresh!, v);
    await summarizeItem(item.id);
    if (disclosure) await auditDisclosure(ctx, item, disclosure);
    return { ok: "Saved", savedAt: new Date().toISOString(), validation, formats: Object.fromEntries(variants.map((v) => [v.channelId, v.format])) };
  });
}

/** Only records a change: re-saving the same answer must not re-stamp setBy/setAt or re-audit. */
function nextDisclosure(current: SyntheticMedia | null, d: Draft, userId: string): SyntheticMedia | null {
  if (!d.syntheticFlag) return null;
  const note = d.syntheticNote || undefined;
  if (current && current.flag === d.syntheticFlag && (current.note ?? undefined) === note) return null;
  return { flag: d.syntheticFlag, note, setBy: userId, setAt: new Date().toISOString() };
}

type Ctx = Awaited<ReturnType<typeof requireCapability>>;
async function auditDisclosure(ctx: Ctx, item: { id: string; organizationId: string; workspaceId: string; syntheticMedia: SyntheticMedia | null }, next: SyntheticMedia) {
  await audit({
    action: "content.disclosure_set", actorUserId: ctx.session.user.id, organizationId: item.organizationId, workspaceId: item.workspaceId,
    targetType: "content_item", targetId: item.id, summary: { before: { flag: item.syntheticMedia?.flag ?? "none" }, after: { flag: next.flag, note: next.note } },
  });
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
