/*
 * Scheduling core: freeze a version, queue one publish job per variant.
 * Shared by the composer's server actions and the public API so an agent
 * cannot schedule anything a person could not — same approval gate, same
 * validation, same audit trail.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import type { WorkspaceRole } from "@/db/schema/app";
import { contentItem, contentVersion, postVariant, publishJob, type PostVariant, type VersionSnapshot } from "@/db/schema/content";
import { matchPolicy } from "@/lib/approvals";
import { audit } from "@/lib/audit";
import { track } from "@/lib/telemetry";
import { validateVariant } from "@/lib/content";
import { emit } from "@/lib/jobs/outbox";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Item = { id: string; organizationId: string; workspaceId: string; currentVersionId: string | null };
export type ScheduleActor = { userId: string; organizationId: string; workspaceId: string; role: WorkspaceRole };
export type ScheduleResult = { error?: string; at?: Date; versionId?: string; channels?: number };

/** Cancel queued jobs for these variants, mark them scheduled, and enqueue fresh jobs via the outbox. */
export async function enqueuePublish(tx: Tx, item: Item, variants: PostVariant[], at: Date, versionId: string | null) {
  await tx.update(publishJob).set({ state: "canceled", finishedAt: new Date() }).where(and(inArray(publishJob.variantId, variants.map((v) => v.id)), eq(publishJob.state, "queued")));
  for (const v of variants) {
    await tx.update(postVariant).set({ status: "scheduled", scheduledAt: at, lastError: null, updatedAt: new Date() }).where(eq(postVariant.id, v.id));
    const [job] = await tx.insert(publishJob).values({ workspaceId: item.workspaceId, variantId: v.id, versionId, scheduledFor: at, attempt: v.attempts + 1 }).returning({ id: publishJob.id });
    await emit(tx, "publish.execute", { publishJobId: job.id }, { organizationId: item.organizationId, workspaceId: item.workspaceId, dedupeKey: `publish:${job.id}`, runAt: at });
  }
}

export async function snapshotVersion(tx: Tx, item: typeof contentItem.$inferSelect, variants: PostVariant[], at: Date, reason: string, userId: string) {
  const [{ max }] = await tx.select({ max: sql<number>`coalesce(max(${contentVersion.number}), 0)` }).from(contentVersion).where(eq(contentVersion.contentItemId, item.id));
  const snapshot: VersionSnapshot = { title: item.title, sharedText: item.sharedText, sharedAssetIds: item.sharedAssetIds, link: item.link, variants: variants.map((v) => ({ channelId: v.channelId, format: v.format, textOverride: v.textOverride, assetIdsOverride: v.assetIdsOverride, firstComment: v.firstComment, linkOverride: v.linkOverride, settings: v.settings, scheduledAt: at.toISOString() })) };
  const [ver] = await tx.insert(contentVersion).values({ contentItemId: item.id, number: Number(max) + 1, snapshot, reason, createdByUserId: userId }).returning({ id: contentVersion.id });
  return ver.id;
}

/** Why this item cannot be scheduled right now, or null. Approval always wins. */
export async function approvalBlock(item: typeof contentItem.$inferSelect, role: WorkspaceRole) {
  if (item.approvalState === "pending") return "This post is waiting for approval.";
  if (item.approvalState === "changes_requested") return "Changes were requested. Address them and request approval again.";
  if (item.approvalState === "approved") return null;
  const policy = await matchPolicy({ workspaceId: item.workspaceId, itemId: item.id, authorRole: role, campaignId: item.campaignId });
  return policy ? `Policy "${policy.name}" requires approval before this can be scheduled. Use Request approval.` : null;
}

/**
 * Schedule (or publish now) every schedulable variant of an item. The caller
 * has already checked `content.publish`; this re-checks the approval gate and
 * per-variant validation, then writes the version and the jobs in one go.
 */
export async function scheduleItemCore(actor: ScheduleActor, itemId: string, when: Date | "now", surface: string): Promise<ScheduleResult> {
  const item = await db.query.contentItem.findFirst({ where: (c, { and, eq, isNull }) => and(eq(c.id, itemId), eq(c.workspaceId, actor.workspaceId), isNull(c.deletedAt)) });
  if (!item) return { error: "Draft not found." };
  const blocked = await approvalBlock(item, actor.role);
  if (blocked) return { error: blocked };
  const variants = await db.select().from(postVariant).where(and(eq(postVariant.contentItemId, item.id), inArray(postVariant.status, ["draft", "failed", "canceled", "scheduled"])));
  if (variants.length === 0) return { error: "Choose at least one channel." };
  const at = when === "now" ? new Date() : when;
  if (when !== "now" && at.getTime() < Date.now() - 60_000) return { error: "Pick a time in the future, or publish now." };
  for (const v of variants) {
    const err = (await validateVariant(item, { ...v, scheduledAt: at })).issues.find((i) => i.severity === "error");
    if (err) return { error: err.message };
  }
  const versionId = await db.transaction(async (tx) => {
    const id = await snapshotVersion(tx, item, variants, at, when === "now" ? "publish" : "schedule", actor.userId);
    await enqueuePublish(tx, item, variants, at, id);
    await tx.update(contentItem).set({ currentVersionId: id, status: "scheduled", scheduledAt: at, updatedAt: new Date() }).where(eq(contentItem.id, item.id));
    return id;
  });
  await audit({ action: when === "now" ? "content.publish" : "content.schedule", actorUserId: actor.userId, organizationId: item.organizationId, workspaceId: actor.workspaceId, targetType: "content_item", targetId: item.id, summary: { after: { versionId, scheduledAt: at.toISOString(), channels: variants.map((v) => v.channelId), surface } } });
  await track("post_scheduled", { userId: actor.userId, organizationId: item.organizationId, workspaceId: actor.workspaceId, surface, props: { mode: when === "now" ? "now" : "later", channels: variants.length } });
  return { at, versionId, channels: variants.length };
}
