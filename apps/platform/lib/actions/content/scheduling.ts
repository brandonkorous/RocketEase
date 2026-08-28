"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { contentItem, contentVersion, postVariant, publishJob, type PostVariant, type VersionSnapshot } from "@/db/schema/content";
import { matchPolicy } from "@/lib/approvals";
import { audit } from "@/lib/audit";
import { AuthorizationError, can } from "@/lib/authz";
import { summarizeItem, validateVariant } from "@/lib/content";
import { emit } from "@/lib/jobs/outbox";
import { requireCapability, requireWorkspace } from "@/lib/session";
import { zonedToUtc } from "@/lib/time";
import { workspacePath } from "@/lib/nav";
import { fail, guard, type ActionState } from "./shared";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Item = { id: string; organizationId: string; workspaceId: string; currentVersionId: string | null };

/** Cancel queued jobs for these variants, mark them scheduled, and enqueue fresh jobs via the outbox. */
async function enqueuePublish(tx: Tx, item: Item, variants: PostVariant[], at: Date, versionId: string | null) {
  await tx.update(publishJob).set({ state: "canceled", finishedAt: new Date() }).where(and(inArray(publishJob.variantId, variants.map((v) => v.id)), eq(publishJob.state, "queued")));
  for (const v of variants) {
    await tx.update(postVariant).set({ status: "scheduled", scheduledAt: at, lastError: null, updatedAt: new Date() }).where(eq(postVariant.id, v.id));
    const [job] = await tx.insert(publishJob).values({ workspaceId: item.workspaceId, variantId: v.id, versionId, scheduledFor: at, attempt: v.attempts + 1 }).returning({ id: publishJob.id });
    await emit(tx, "publish.execute", { publishJobId: job.id }, { organizationId: item.organizationId, workspaceId: item.workspaceId, dedupeKey: `publish:${job.id}`, runAt: at });
  }
}

async function snapshotVersion(tx: Tx, item: typeof contentItem.$inferSelect, variants: PostVariant[], at: Date, reason: string, userId: string) {
  const [{ max }] = await tx.select({ max: sql<number>`coalesce(max(${contentVersion.number}), 0)` }).from(contentVersion).where(eq(contentVersion.contentItemId, item.id));
  const snapshot: VersionSnapshot = { title: item.title, sharedText: item.sharedText, sharedAssetIds: item.sharedAssetIds, link: item.link, variants: variants.map((v) => ({ channelId: v.channelId, format: v.format, textOverride: v.textOverride, assetIdsOverride: v.assetIdsOverride, firstComment: v.firstComment, linkOverride: v.linkOverride, settings: v.settings, scheduledAt: at.toISOString() })) };
  const [ver] = await tx.insert(contentVersion).values({ contentItemId: item.id, number: Number(max) + 1, snapshot, reason, createdByUserId: userId }).returning({ id: contentVersion.id });
  return ver.id;
}

const scheduleSchema = z.object({ workspaceId: z.string(), itemId: z.string(), when: z.string() });

/** Schedule (or publish now). Creates an immutable version and a publish job per variant. */
export async function scheduleItem(input: z.infer<typeof scheduleSchema>): Promise<ActionState & { redirect?: string }> {
  const parsed = scheduleSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid schedule");
  const { workspaceId, itemId, when } = parsed.data;
  return guard(async () => {
    const ctx = await requireWorkspace(workspaceId);
    if (!can({ role: ctx.workspace.role, grants: ctx.workspace.grants }, "content.publish", { policyAllows: true })) throw new AuthorizationError("content.publish");
    const item = await db.query.contentItem.findFirst({ where: (c, { and, eq, isNull }) => and(eq(c.id, itemId), eq(c.workspaceId, workspaceId), isNull(c.deletedAt)) });
    if (!item) return fail("Draft not found.");
    const blockedBy = await approvalBlock(item, ctx.workspace.role);
    if (blockedBy) return fail(blockedBy);
    const variants = await db.select().from(postVariant).where(and(eq(postVariant.contentItemId, item.id), inArray(postVariant.status, ["draft", "failed", "canceled", "scheduled"])));
    if (variants.length === 0) return fail("Choose at least one channel.");
    const at = when === "now" ? new Date() : zonedToUtc(when, ctx.workspace.timezone);
    if (when !== "now" && at.getTime() < Date.now() - 60_000) return fail("Pick a time in the future, or choose Publish now.");
    for (const v of variants) {
      const err = (await validateVariant(item, { ...v, scheduledAt: at })).issues.find((i) => i.severity === "error");
      if (err) return fail(err.message);
    }
    const versionId = await db.transaction(async (tx) => {
      const id = await snapshotVersion(tx, item, variants, at, when === "now" ? "publish" : "schedule", ctx.session.user.id);
      await enqueuePublish(tx, item, variants, at, id);
      await tx.update(contentItem).set({ currentVersionId: id, status: "scheduled", scheduledAt: at, updatedAt: new Date() }).where(eq(contentItem.id, item.id));
      return id;
    });
    await audit({ action: when === "now" ? "content.publish" : "content.schedule", actorUserId: ctx.session.user.id, organizationId: item.organizationId, workspaceId, targetType: "content_item", targetId: item.id, summary: { after: { versionId, scheduledAt: at.toISOString(), channels: variants.map((v) => v.channelId) } } });
    revalidatePath(workspacePath(workspaceId, "calendar"));
    return { ok: when === "now" ? "Publishing now." : "Scheduled.", redirect: workspacePath(workspaceId, `posts/${item.id}`) };
  });
}

async function approvalBlock(item: typeof contentItem.$inferSelect, role: Parameters<typeof matchPolicy>[0]["authorRole"]) {
  if (item.approvalState === "pending") return "This post is waiting for approval.";
  if (item.approvalState === "changes_requested") return "Changes were requested. Address them and request approval again.";
  if (item.approvalState === "approved") return null;
  const policy = await matchPolicy({ workspaceId: item.workspaceId, itemId: item.id, authorRole: role, campaignId: item.campaignId });
  return policy ? `Policy "${policy.name}" requires approval before this can be scheduled. Use Request approval.` : null;
}

export async function cancelSchedule(workspaceId: string, itemId: string): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "content.publish", { policyAllows: true });
    const item = await db.query.contentItem.findFirst({ where: (c, { and, eq }) => and(eq(c.id, itemId), eq(c.workspaceId, workspaceId)) });
    if (!item) return fail("Post not found.");
    const ids = (await db.select({ id: postVariant.id }).from(postVariant).where(and(eq(postVariant.contentItemId, item.id), eq(postVariant.status, "scheduled")))).map((r) => r.id);
    if (!ids.length) return fail("Nothing is scheduled.");
    await db.transaction(async (tx) => {
      await tx.update(publishJob).set({ state: "canceled", finishedAt: new Date() }).where(and(inArray(publishJob.variantId, ids), eq(publishJob.state, "queued")));
      await tx.update(postVariant).set({ status: "draft", scheduledAt: null, updatedAt: new Date() }).where(inArray(postVariant.id, ids));
    });
    await summarizeItem(item.id);
    await audit({ action: "content.unschedule", actorUserId: ctx.session.user.id, organizationId: item.organizationId, workspaceId, targetType: "content_item", targetId: item.id });
    revalidatePath(workspacePath(workspaceId, "calendar"));
    return { ok: "Unscheduled. It's back to a draft." };
  });
}

/** Retry only the failed destinations (flows.md step 9). */
export async function retryFailed(workspaceId: string, itemId: string): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "content.publish", { policyAllows: true });
    const item = await db.query.contentItem.findFirst({ where: (c, { and, eq }) => and(eq(c.id, itemId), eq(c.workspaceId, workspaceId)) });
    if (!item) return fail("Post not found.");
    const failed = await db.select().from(postVariant).where(and(eq(postVariant.contentItemId, item.id), eq(postVariant.status, "failed")));
    if (!failed.length) return fail("Nothing to retry.");
    await db.transaction((tx) => enqueuePublish(tx, item, failed, new Date(), item.currentVersionId));
    await summarizeItem(item.id);
    await audit({ action: "content.retry", actorUserId: ctx.session.user.id, organizationId: item.organizationId, workspaceId, targetType: "content_item", targetId: item.id, summary: { after: { variants: failed.map((v) => v.id) } } });
    revalidatePath(workspacePath(workspaceId, `posts/${item.id}`));
    return { ok: `Retrying ${failed.length} destination${failed.length === 1 ? "" : "s"}.` };
  });
}

/** Reschedule every scheduled variant of an item (calendar drag / detail). */
export async function rescheduleItem(workspaceId: string, itemId: string, whenLocal: string): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "content.publish", { policyAllows: true });
    const item = await db.query.contentItem.findFirst({ where: (c, { and, eq }) => and(eq(c.id, itemId), eq(c.workspaceId, workspaceId)) });
    if (!item) return fail("Post not found.");
    const at = zonedToUtc(whenLocal, ctx.workspace.timezone);
    if (at.getTime() < Date.now() - 60_000) return fail("Pick a time in the future.");
    const sched = await db.select().from(postVariant).where(and(eq(postVariant.contentItemId, item.id), eq(postVariant.status, "scheduled")));
    if (!sched.length) return fail("This post isn't scheduled.");
    await db.transaction(async (tx) => {
      await enqueuePublish(tx, item, sched, at, item.currentVersionId);
      await tx.update(contentItem).set({ scheduledAt: at, updatedAt: new Date() }).where(eq(contentItem.id, item.id));
    });
    await audit({ action: "content.reschedule", actorUserId: ctx.session.user.id, organizationId: item.organizationId, workspaceId, targetType: "content_item", targetId: item.id, summary: { before: { scheduledAt: item.scheduledAt?.toISOString() }, after: { scheduledAt: at.toISOString() } } });
    revalidatePath(workspacePath(workspaceId, "calendar"));
    return { ok: "Rescheduled." };
  });
}
