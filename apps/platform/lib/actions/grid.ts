"use server";

/*
 * Grid mutations. Moving a tile is a RESCHEDULE — the same publish jobs, audit rows
 * and approval rules as the Calendar — never a separate notion of "grid order".
 * A cover choice is a setting on the variant, read again at publish time.
 */
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { assetFrame } from "@/db/schema/assets";
import { contentItem, postVariant } from "@/db/schema/content";
import { audit } from "@/lib/audit";
import { resolveVariant } from "@/lib/content";
import { emit } from "@/lib/jobs/outbox";
import { workspacePath } from "@/lib/nav";
import { enqueuePublish, scheduleItemCore } from "@/lib/publishing/schedule";
import { requireCapability } from "@/lib/session";
import { zonedToUtc } from "@/lib/time";
import { fail, guard, type ActionState } from "./content/shared";

const refresh = (workspaceId: string) => {
  revalidatePath(workspacePath(workspaceId, "grid"));
  revalidatePath(workspacePath(workspaceId, "calendar"));
};

async function scheduledItem(workspaceId: string, itemId: string) {
  const item = await db.query.contentItem.findFirst({ where: (c, { and, eq, isNull }) => and(eq(c.id, itemId), eq(c.workspaceId, workspaceId), isNull(c.deletedAt)) });
  if (!item) return null;
  const variants = await db.select().from(postVariant).where(and(eq(postVariant.contentItemId, item.id), eq(postVariant.status, "scheduled")));
  const at = variants[0]?.scheduledAt ?? item.scheduledAt;
  return variants.length && at ? { item, variants, at } : null;
}

/** Two scheduled posts trade dates. Every destination of each post moves, as on the Calendar. */
export async function swapSchedule(workspaceId: string, itemIdA: string, itemIdB: string): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "content.publish", { policyAllows: true });
    if (itemIdA === itemIdB) return fail("Pick two different posts.");
    const [a, b] = await Promise.all([scheduledItem(workspaceId, itemIdA), scheduledItem(workspaceId, itemIdB)]);
    if (!a || !b) return fail("Only scheduled posts can swap places.");
    if (Math.min(a.at.getTime(), b.at.getTime()) < Date.now() - 60_000) return fail("One of these is about to publish. Pick another tile.");
    await db.transaction(async (tx) => {
      await enqueuePublish(tx, a.item, a.variants, b.at, a.item.currentVersionId);
      await tx.update(contentItem).set({ scheduledAt: b.at, updatedAt: new Date() }).where(eq(contentItem.id, a.item.id));
      await enqueuePublish(tx, b.item, b.variants, a.at, b.item.currentVersionId);
      await tx.update(contentItem).set({ scheduledAt: a.at, updatedAt: new Date() }).where(eq(contentItem.id, b.item.id));
    });
    const actor = ctx.session.user.id;
    for (const [from, to] of [[a, b], [b, a]] as const) {
      await audit({ action: "content.reschedule", actorUserId: actor, organizationId: from.item.organizationId, workspaceId, targetType: "content_item", targetId: from.item.id, summary: { before: { scheduledAt: from.at.toISOString() }, after: { scheduledAt: to.at.toISOString() }, note: `grid swap with ${to.item.id}` } });
    }
    refresh(workspaceId);
    return { ok: "Swapped." };
  });
}

/** A draft dropped on a gap: scheduled through the same core as the composer, so approval and billing gates hold. */
export async function scheduleDraftAt(workspaceId: string, itemId: string, whenLocal: string): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "content.publish", { policyAllows: true });
    const actor = { userId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId, role: ctx.workspace.role };
    const r = await scheduleItemCore(actor, itemId, zonedToUtc(whenLocal, ctx.workspace.timezone), "grid");
    if (r.error) return fail(r.error);
    refresh(workspaceId);
    return { ok: "Scheduled." };
  });
}

/** Pull candidate frames for a video, once. The worker skips offsets it already has. */
export async function requestCoverFrames(workspaceId: string, assetId: string): Promise<ActionState> {
  return guard(async () => {
    await requireCapability(workspaceId, "content.edit");
    const a = await db.query.asset.findFirst({ where: (x, { and, eq, isNull }) => and(eq(x.id, assetId), eq(x.workspaceId, workspaceId), isNull(x.deletedAt)) });
    if (!a || a.kind !== "video") return fail("Only a video has cover frames.");
    if (a.uploadStatus !== "ready") return fail("The video is still processing.");
    const [existing] = await db.select({ id: assetFrame.id }).from(assetFrame).where(eq(assetFrame.assetId, a.id)).limit(1);
    if (existing) return { ok: "Frames are ready." };
    await emit(db, "asset.frames", { assetId: a.id }, { organizationId: a.organizationId, workspaceId, dedupeKey: `frames:${a.id}` });
    return { ok: "Pulling frames from the video…" };
  });
}

/** Choose (or clear) the cover for one destination. A live post keeps the cover the network already shows. */
export async function setCoverFrame(workspaceId: string, variantId: string, frameId: string | null): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "content.edit");
    const v = await db.query.postVariant.findFirst({ where: (x, { and, eq }) => and(eq(x.id, variantId), eq(x.workspaceId, workspaceId)) });
    const item = v && (await db.query.contentItem.findFirst({ where: (c, { eq }) => eq(c.id, v.contentItemId) }));
    if (!v || !item) return fail("Post not found.");
    if (v.status === "published") return fail("This post is live. Its cover can't change from here.");
    const before = (v.settings as Record<string, unknown>).cover ?? null;
    const { cover: _drop, ...rest } = v.settings as Record<string, unknown>;
    let settings: Record<string, unknown> = rest;
    if (frameId) {
      const frame = await db.query.assetFrame.findFirst({ where: (f, { eq }) => eq(f.id, frameId) });
      if (!frame || !resolveVariant(item, v).assetIds.includes(frame.assetId)) return fail("That frame isn't from this post's video.");
      settings = { ...rest, cover: { frameId: frame.id, offsetMs: frame.offsetMs } };
    }
    await db.update(postVariant).set({ settings, updatedAt: new Date() }).where(eq(postVariant.id, v.id));
    await audit({ action: "content.cover", actorUserId: ctx.session.user.id, organizationId: item.organizationId, workspaceId, targetType: "post_variant", targetId: v.id, summary: { before, after: settings.cover ?? null } });
    refresh(workspaceId);
    return { ok: frameId ? "Cover set." : "Cover cleared." };
  });
}
