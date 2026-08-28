"use server";

import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { contentItem, contentTemplate, postVariant, type TemplateVariant } from "@/db/schema/content";
import { audit } from "@/lib/audit";
import { requireCapability, requireWorkspace } from "@/lib/session";
import { fail, guard, type ActionState } from "./content/shared";

export type TemplateRow = { id: string; name: string; text: string; channelCount: number; usageCount: number; updatedAt: string };

/** Templates for the "Start from template" picker (any member may read). */
export async function listTemplates(workspaceId: string): Promise<TemplateRow[]> {
  await requireWorkspace(workspaceId);
  const rows = await db.select().from(contentTemplate).where(eq(contentTemplate.workspaceId, workspaceId)).orderBy(desc(contentTemplate.updatedAt)).limit(100);
  return rows.map((t) => ({ id: t.id, name: t.name, text: t.sharedText.slice(0, 140), channelCount: t.variants.length, usageCount: t.usageCount, updatedAt: t.updatedAt.toISOString() }));
}

const saveSchema = z.object({ workspaceId: z.string().min(1), itemId: z.string().min(1), name: z.string().trim().min(1, "Name the template").max(80) });

/** Snapshot a draft/post as a reusable template; the item stays untouched. */
export async function saveAsTemplate(input: z.input<typeof saveSchema>): Promise<ActionState & { templateId?: string }> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid template");
  const { workspaceId, itemId, name } = parsed.data;
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "content.create");
    const item = await db.query.contentItem.findFirst({ where: (c, { and, eq, isNull }) => and(eq(c.id, itemId), eq(c.workspaceId, workspaceId), isNull(c.deletedAt)) });
    if (!item) return fail("Post not found.");
    const vs = await db.select().from(postVariant).where(eq(postVariant.contentItemId, item.id));
    const variants: TemplateVariant[] = vs.map((v) => ({ channelId: v.channelId, format: v.format, textOverride: v.textOverride, assetIdsOverride: v.assetIdsOverride, firstComment: v.firstComment, linkOverride: v.linkOverride, settings: v.settings }));
    const [row] = await db.insert(contentTemplate).values({ organizationId: item.organizationId, workspaceId, name, sharedText: item.sharedText, sharedAssetIds: item.sharedAssetIds, link: item.link, tagIds: item.tagIds, variants, sourceItemId: item.id, createdByUserId: ctx.session.user.id }).returning({ id: contentTemplate.id });
    await audit({ action: "content.template_create", actorUserId: ctx.session.user.id, organizationId: item.organizationId, workspaceId, targetType: "content_template", targetId: row.id, summary: { note: `from ${item.id}`, after: { name } } });
    return { ok: "Saved as template.", templateId: row.id };
  });
}

/** New draft from a template. Lineage is kept on the audit trail (`content.create_from_template`). */
export async function createFromTemplate(workspaceId: string, templateId: string): Promise<ActionState | { itemId: string }> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "content.create");
    const [t] = await db.select().from(contentTemplate).where(and(eq(contentTemplate.id, templateId), eq(contentTemplate.workspaceId, workspaceId)));
    if (!t) return fail("Template not found.");
    const newId = await db.transaction(async (tx) => {
      const [row] = await tx.insert(contentItem).values({ organizationId: t.organizationId, workspaceId, title: t.name, sharedText: t.sharedText, sharedAssetIds: t.sharedAssetIds, link: t.link, tagIds: t.tagIds, ownerUserId: ctx.session.user.id, createdByUserId: ctx.session.user.id }).returning({ id: contentItem.id });
      for (const v of t.variants) await tx.insert(postVariant).values({ organizationId: t.organizationId, workspaceId, contentItemId: row.id, channelId: v.channelId, format: v.format as typeof postVariant.$inferInsert.format, textOverride: v.textOverride, assetIdsOverride: v.assetIdsOverride, firstComment: v.firstComment, linkOverride: v.linkOverride, settings: v.settings }).onConflictDoNothing();
      await tx.update(contentTemplate).set({ usageCount: sql`${contentTemplate.usageCount} + 1` }).where(eq(contentTemplate.id, t.id));
      return row.id;
    });
    await audit({ action: "content.create_from_template", actorUserId: ctx.session.user.id, organizationId: t.organizationId, workspaceId, targetType: "content_item", targetId: newId, summary: { note: `from template ${t.id}`, after: { templateId: t.id, sourceItemId: t.sourceItemId } } });
    return { itemId: newId };
  });
}

export async function deleteTemplate(workspaceId: string, templateId: string): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "content.edit");
    const [t] = await db.delete(contentTemplate).where(and(eq(contentTemplate.id, templateId), eq(contentTemplate.workspaceId, workspaceId))).returning({ id: contentTemplate.id, organizationId: contentTemplate.organizationId });
    if (!t) return fail("Template not found.");
    await audit({ action: "content.template_delete", actorUserId: ctx.session.user.id, organizationId: t.organizationId, workspaceId, targetType: "content_template", targetId: t.id });
    return { ok: "Template deleted." };
  });
}
