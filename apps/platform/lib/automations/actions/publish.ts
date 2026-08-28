/*
 * Publishing actions. Both of these are things the rule's creator could do by
 * hand; the automation just does them sooner. Retries reuse the publish job
 * chain so `idempotencyKey` and the reconcile-before-retry rule still hold.
 */
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import type { ActionOutcome, RuleAction } from "@/db/schema/automations";
import { approvalRequest } from "@/db/schema/approvals";
import { contentItem, contentVersion, postVariant, publishJob, type VersionSnapshot } from "@/db/schema/content";
import { emit } from "@/lib/jobs/outbox";
import type { ApplyContext } from "./types";

const done = (kind: RuleAction["kind"], detail: string): ActionOutcome => ({ kind, status: "applied", detail });
const skip = (kind: RuleAction["kind"], detail: string): ActionOutcome => ({ kind, status: "skipped", detail });

const backoffMinutes = (attempt: number) => Math.min(60, 2 ** Math.max(0, attempt - 1));

/** Schedules one more attempt for a failed variant. Never touches a variant that is not failed. */
async function retryPublish(c: ApplyContext, delayMinutes?: number): Promise<ActionOutcome> {
  const variantId = c.subject.ctx.variantId;
  if (!variantId) return skip("publish.retry", "this trigger has no post variant");
  const v = await db.query.postVariant.findFirst({ where: (x, { eq }) => eq(x.id, variantId) });
  if (!v) return skip("publish.retry", "post variant not found");
  if (v.status !== "failed") return skip("publish.retry", `the variant is ${v.status}, not failed`);
  if (v.lastError?.ambiguous) return skip("publish.retry", "the provider outcome was ambiguous — it must be reconciled by a person first");
  const last = await db.query.publishJob.findFirst({ where: (j, { eq }) => eq(j.variantId, v.id), orderBy: (j, { desc }) => desc(j.attempt) });
  const attempt = (last?.attempt ?? 1) + 1;
  const at = new Date(Date.now() + (delayMinutes ?? backoffMinutes(attempt)) * 60_000);
  await db.transaction(async (tx) => {
    await tx.update(postVariant).set({ status: "scheduled", updatedAt: new Date() }).where(eq(postVariant.id, v.id));
    const [next] = await tx.insert(publishJob).values({ workspaceId: v.workspaceId, variantId: v.id, versionId: last?.versionId ?? null, scheduledFor: at, attempt }).returning({ id: publishJob.id });
    await emit(tx, "publish.execute", { publishJobId: next.id }, { organizationId: v.organizationId, workspaceId: v.workspaceId, dedupeKey: `publish:${next.id}`, runAt: at });
  });
  return done("publish.retry", `attempt ${attempt} scheduled for ${at.toISOString()}`);
}

/** Freezes the current state as a version and opens a request against it, as the rule's creator. */
async function requestApproval(c: ApplyContext, assigneeUserId?: string | null): Promise<ActionOutcome> {
  const itemId = c.subject.ctx.contentItemId;
  if (!itemId) return skip("publish.request_approval", "this trigger has no post");
  const item = await db.query.contentItem.findFirst({ where: (x, { and, eq, isNull }) => and(eq(x.id, itemId), isNull(x.deletedAt)) });
  if (!item) return skip("publish.request_approval", "post not found");
  const open = await db.query.approvalRequest.findFirst({ where: (r, { and, eq }) => and(eq(r.contentItemId, itemId), eq(r.state, "pending")) });
  if (open) return done("publish.request_approval", "a review was already pending");
  const variants = await db.select().from(postVariant).where(eq(postVariant.contentItemId, itemId));
  if (!variants.length) return skip("publish.request_approval", "the post has no channels");
  const requestId = await db.transaction(async (tx) => {
    const [{ max }] = await tx.select({ max: sql<number>`coalesce(max(${contentVersion.number}), 0)` }).from(contentVersion).where(eq(contentVersion.contentItemId, itemId));
    const snapshot: VersionSnapshot = {
      title: item.title,
      sharedText: item.sharedText,
      sharedAssetIds: item.sharedAssetIds,
      link: item.link,
      variants: variants.map((v) => ({ channelId: v.channelId, format: v.format, textOverride: v.textOverride, assetIdsOverride: v.assetIdsOverride, firstComment: v.firstComment, linkOverride: v.linkOverride, settings: v.settings, scheduledAt: v.scheduledAt?.toISOString() ?? null })),
    };
    const [ver] = await tx.insert(contentVersion).values({ contentItemId: itemId, number: Number(max) + 1, snapshot, reason: "automation", createdByUserId: c.creator?.userId ?? null }).returning({ id: contentVersion.id });
    const [req] = await tx
      .insert(approvalRequest)
      .values({ organizationId: item.organizationId, workspaceId: item.workspaceId, contentItemId: itemId, versionId: ver.id, requestedByUserId: c.creator?.userId ?? null, assigneeUserId: assigneeUserId ?? null, note: `Opened automatically by the rule "${c.rule.name}".` })
      .returning({ id: approvalRequest.id });
    await tx.update(contentItem).set({ approvalState: "pending", status: "in_review", currentVersionId: ver.id, updatedAt: new Date() }).where(eq(contentItem.id, itemId));
    return req.id;
  });
  return done("publish.request_approval", `review opened (request ${requestId})`);
}

export async function applyPublishAction(c: ApplyContext, a: RuleAction): Promise<ActionOutcome> {
  if (a.kind === "publish.retry") return retryPublish(c, a.delayMinutes);
  if (a.kind === "publish.request_approval") return requestApproval(c, a.assigneeUserId);
  return skip(a.kind, "not a publishing action");
}
