"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { contentItem, postVariant, publishJob } from "@/db/schema/content";
import { audit } from "@/lib/audit";
import { AuthorizationError, can } from "@/lib/authz";
import { summarizeItem } from "@/lib/content";
import { enqueuePublish, scheduleItemCore } from "@/lib/publishing/schedule";
import { requireCapability, requireWorkspace } from "@/lib/session";
import { zonedToUtc } from "@/lib/time";
import { workspacePath } from "@/lib/nav";
import { fail, guard, type ActionState } from "./shared";

const scheduleSchema = z.object({ workspaceId: z.string(), itemId: z.string(), when: z.string() });

/** Schedule (or publish now). Creates an immutable version and a publish job per variant. */
export async function scheduleItem(input: z.infer<typeof scheduleSchema>): Promise<ActionState & { redirect?: string }> {
  const parsed = scheduleSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid schedule");
  const { workspaceId, itemId, when } = parsed.data;
  return guard(async () => {
    const ctx = await requireWorkspace(workspaceId);
    if (!can({ role: ctx.workspace.role, grants: ctx.workspace.grants }, "content.publish", { policyAllows: true })) throw new AuthorizationError("content.publish");
    const actor = { userId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId, role: ctx.workspace.role };
    const at = when === "now" ? ("now" as const) : zonedToUtc(when, ctx.workspace.timezone);
    const r = await scheduleItemCore(actor, itemId, at, "action:scheduleItem");
    if (r.error) return fail(r.error);
    revalidatePath(workspacePath(workspaceId, "calendar"));
    return { ok: when === "now" ? "Publishing now." : "Scheduled.", redirect: workspacePath(workspaceId, `posts/${itemId}`) };
  });
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
