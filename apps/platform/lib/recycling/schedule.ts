/*
 * Scheduling a recycled draft from the worker.
 *
 * Mirrors the composer's schedule path (immutable version → publish_job →
 * outbox), minus the request-scoped session. Never bypasses the outbox and
 * never touches `idempotencyKey`.
 */
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { contentItem, contentVersion, postVariant, publishJob, type VersionSnapshot } from "@/db/schema/content";
import { emit } from "@/lib/jobs/outbox";

/** Schedule every draft variant of a recycled item for `at`. */
export async function scheduleRecycled(itemId: string, at: Date, actorUserId: string | null) {
  const item = await db.query.contentItem.findFirst({ where: (c, { eq }) => eq(c.id, itemId) });
  if (!item) return;
  const variants = await db.select().from(postVariant).where(eq(postVariant.contentItemId, itemId));
  if (variants.length === 0) return;
  await db.transaction(async (tx) => {
    const [{ max }] = await tx.select({ max: sql<number>`coalesce(max(${contentVersion.number}), 0)` }).from(contentVersion).where(eq(contentVersion.contentItemId, itemId));
    const snapshot: VersionSnapshot = {
      title: item.title,
      sharedText: item.sharedText,
      sharedAssetIds: item.sharedAssetIds,
      link: item.link,
      variants: variants.map((v) => ({ channelId: v.channelId, format: v.format, textOverride: v.textOverride, assetIdsOverride: v.assetIdsOverride, firstComment: v.firstComment, linkOverride: v.linkOverride, settings: v.settings, scheduledAt: at.toISOString() })),
    };
    const [ver] = await tx.insert(contentVersion).values({ contentItemId: itemId, number: Number(max) + 1, snapshot, reason: "recycle", createdByUserId: actorUserId }).returning({ id: contentVersion.id });
    for (const v of variants) {
      await tx.update(postVariant).set({ status: "scheduled", scheduledAt: at, lastError: null, updatedAt: new Date() }).where(eq(postVariant.id, v.id));
      const [job] = await tx.insert(publishJob).values({ workspaceId: item.workspaceId, variantId: v.id, versionId: ver.id, scheduledFor: at, attempt: v.attempts + 1 }).returning({ id: publishJob.id });
      await emit(tx, "publish.execute", { publishJobId: job.id }, { organizationId: item.organizationId, workspaceId: item.workspaceId, dedupeKey: `publish:${job.id}`, runAt: at });
    }
    await tx.update(contentItem).set({ currentVersionId: ver.id, status: "scheduled", scheduledAt: at, updatedAt: new Date() }).where(eq(contentItem.id, itemId));
  });
}
