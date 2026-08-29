import { eq } from "drizzle-orm";
import type { PublishResult } from "@rocketease/providers";
import { db } from "@/db";
import { postVariant, publishJob, remotePublication, type VariantError } from "@/db/schema/content";
import { audit } from "@/lib/audit";
import { summarizeItem } from "@/lib/content";
import { emit } from "@/lib/jobs/outbox";
import { notify } from "@/lib/notifications";
import { track } from "@/lib/telemetry";
import type { HandlerContext } from "../index";

export const MAX_ATTEMPTS = 5;
export const backoffSeconds = (attempt: number) => Math.min(3600, 60 * 2 ** (attempt - 1));

export type Item = { id: string; organizationId: string; workspaceId: string; title: string; ownerUserId: string | null };
export type Job = { id: string; attempt: number; versionId: string | null };
export type Variant = { id: string; channelId: string; format: string };

export function err(category: string, message: string, providerCode?: string, ambiguous?: boolean): VariantError {
  return { category, message, providerCode, ambiguous, at: new Date().toISOString() };
}

export async function succeed(job: Job, v: Variant, item: Item, ch: { id: string; name: string; network: string }, result: PublishResult, l: HandlerContext["log"]) {
  await db.transaction(async (tx) => {
    await tx.update(postVariant).set({ status: "published", publishedAt: new Date(result.publishedAt), remoteId: result.remoteId, remoteUrl: result.url ?? null, disclosure: result.disclosure ?? null, lastError: null, updatedAt: new Date() }).where(eq(postVariant.id, v.id));
    await tx.insert(remotePublication).values({ variantId: v.id, channelId: ch.id, remoteId: result.remoteId, url: result.url ?? null, publishedAt: new Date(result.publishedAt) }).onConflictDoNothing();
    await tx.update(publishJob).set({ state: "succeeded", finishedAt: new Date() }).where(eq(publishJob.id, job.id));
    await emit(tx, "automation.evaluate", { trigger: "post.published", refId: v.id }, { organizationId: item.organizationId, workspaceId: item.workspaceId, dedupeKey: `automation:published:${v.id}` });
  });
  await summarizeItem(item.id);
  await audit({ action: "publish.succeeded", organizationId: item.organizationId, workspaceId: item.workspaceId, targetType: "post_variant", targetId: v.id, summary: { after: { remoteId: result.remoteId, channel: ch.name, disclosure: result.disclosure?.method ?? "none" } } });
  await track("post_published", { organizationId: item.organizationId, workspaceId: item.workspaceId, surface: "job:publish.execute", props: { network: ch.network, format: v.format, attempt: job.attempt } });
  l.info("published", { remoteId: result.remoteId });
}

/** Retryable failure: record it and schedule the next attempt with backoff (rate limits wait ≥5 min). */
export async function retryLater(job: Job, v: Variant, item: Item, failure: VariantError, l: HandlerContext["log"]) {
  const delay = failure.category === "rate_limit" ? Math.max(backoffSeconds(job.attempt), 300) : backoffSeconds(job.attempt);
  const at = new Date(Date.now() + delay * 1000);
  await db.transaction(async (tx) => {
    await tx.update(publishJob).set({ state: "failed", finishedAt: new Date(), lastError: failure }).where(eq(publishJob.id, job.id));
    await tx.update(postVariant).set({ status: "scheduled", lastError: failure, updatedAt: new Date() }).where(eq(postVariant.id, v.id));
    const [next] = await tx.insert(publishJob).values({ workspaceId: item.workspaceId, variantId: v.id, versionId: job.versionId, scheduledFor: at, attempt: job.attempt + 1 }).returning({ id: publishJob.id });
    await emit(tx, "publish.execute", { publishJobId: next.id }, { organizationId: item.organizationId, workspaceId: item.workspaceId, dedupeKey: `publish:${next.id}`, runAt: at });
  });
  l.warn("publish failed; retry scheduled", { category: failure.category, inSeconds: delay });
}

/** Permanent failure: variant → failed, audit, telemetry, owner notification (email). */
export async function finish(jobId: string, v: { id: string; channelId: string }, item: Item, failure: VariantError, l: HandlerContext["log"]) {
  await db.transaction(async (tx) => {
    await tx.update(publishJob).set({ state: "failed", finishedAt: new Date(), lastError: failure }).where(eq(publishJob.id, jobId));
    await tx.update(postVariant).set({ status: "failed", lastError: failure, updatedAt: new Date() }).where(eq(postVariant.id, v.id));
    await emit(tx, "automation.evaluate", { trigger: "post.failed", refId: v.id }, { organizationId: item.organizationId, workspaceId: item.workspaceId, dedupeKey: `automation:failed:${v.id}` });
  });
  await summarizeItem(item.id);
  const ch = await db.query.channel.findFirst({ where: (c, { eq }) => eq(c.id, v.channelId) });
  await audit({ action: "publish.failed", organizationId: item.organizationId, workspaceId: item.workspaceId, targetType: "post_variant", targetId: v.id, result: "error", summary: { note: `${failure.category}: ${failure.message}` } });
  await track("post_failed", { organizationId: item.organizationId, workspaceId: item.workspaceId, surface: "job:publish.execute", outcome: "error", props: { network: ch?.network ?? null, category: failure.category, ambiguous: Boolean(failure.ambiguous) } });
  await notify({ workspaceId: item.workspaceId, organizationId: item.organizationId, userId: item.ownerUserId, kind: "publish.failed", title: `Post failed to publish to ${ch?.name ?? "a channel"}`, body: failure.message, href: `/app/${item.workspaceId}/posts/${item.id}`, email: true });
  l.error("publish failed permanently", { category: failure.category, message: failure.message });
}
