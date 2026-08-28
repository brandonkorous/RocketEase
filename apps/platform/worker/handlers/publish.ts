import { and, eq } from "drizzle-orm";
import { ProviderError, type PublishResult } from "@make-it-social/providers";
import { db } from "@/db";
import { contentItem, postVariant, publishJob, remotePublication, type VariantError } from "@/db/schema/content";
import { audit } from "@/lib/audit";
import { mediaForAssets, resolveVariant, summarizeItem, validateVariant } from "@/lib/content";
import { emit } from "@/lib/jobs/outbox";
import type { JobPayloads } from "@/lib/jobs/queues";
import { notify } from "@/lib/notifications";
import { getAdapter, loadCredential, toDescriptor } from "@/lib/providers";
import type { HandlerContext } from "./index";

const MAX_ATTEMPTS = 5;
const backoffSeconds = (attempt: number) => Math.min(3600, 60 * 2 ** (attempt - 1));

/**
 * Execute one publish job (architecture.md "Request and job patterns"):
 *   1. claim the job (queued → running); ignore if already handled
 *   2. re-validate token, capability, version, approval, asset rights
 *   3. publish with the variant's idempotency key
 *   4. success → remote publication; ambiguous → RECONCILE before any retry;
 *      retryable → new job with backoff; permanent → failed + notification
 */
export async function publishExecute(data: JobPayloads["publish.execute"], ctx: HandlerContext) {
  const claimed = await db
    .update(publishJob)
    .set({ state: "running", startedAt: new Date() })
    .where(and(eq(publishJob.id, data.publishJobId), eq(publishJob.state, "queued")))
    .returning();
  const job = claimed[0];
  if (!job) return; // canceled, or another worker took it
  const l = ctx.log.child({ publishJobId: job.id, variantId: job.variantId, attempt: job.attempt });

  const v = await db.query.postVariant.findFirst({ where: (p, { eq }) => eq(p.id, job.variantId) });
  const item = v ? await db.query.contentItem.findFirst({ where: (c, { eq }) => eq(c.id, v.contentItemId) }) : null;
  if (!v || !item || v.status !== "scheduled") {
    await db.update(publishJob).set({ state: "canceled", finishedAt: new Date() }).where(eq(publishJob.id, job.id));
    return;
  }
  // Version pin: if the item moved on to a newer version, this job is stale.
  if (job.versionId && item.currentVersionId && job.versionId !== item.currentVersionId) {
    await db.update(publishJob).set({ state: "canceled", finishedAt: new Date(), lastError: err("stale_version", "A newer version was scheduled") }).where(eq(publishJob.id, job.id));
    return;
  }
  if (item.approvalState === "pending" || item.approvalState === "changes_requested") {
    return finish(job.id, v, item, "failed", err("approval", "Approval is no longer valid for this version"), l);
  }

  const ch = await db.query.channel.findFirst({ where: (c, { eq }) => eq(c.id, v.channelId) });
  const conn = ch ? await db.query.providerConnection.findFirst({ where: (c, { eq }) => eq(c.id, ch.connectionId) }) : null;
  if (!ch || !conn || ["disconnected", "revoked"].includes(ch.status)) {
    return finish(job.id, v, item, "failed", err("permission", "Channel is disconnected"), l);
  }

  const validation = await validateVariant(item, v);
  const blocking = validation.issues.filter((i) => i.severity === "error");
  if (blocking.length) return finish(job.id, v, item, "failed", err("validation", blocking[0].message, blocking[0].code), l);

  await db.update(postVariant).set({ status: "publishing", attempts: v.attempts + 1, updatedAt: new Date() }).where(eq(postVariant.id, v.id));

  const adapter = getAdapter(conn.provider);
  const descriptor = toDescriptor(ch);
  const r = resolveVariant(item, v);
  let result: PublishResult | null = null;
  let failure: VariantError | null = null;
  let retryable = false;

  try {
    const cred = await loadCredential(conn);
    const { media } = await mediaForAssets(r.assetIds, { forPublish: true });
    try {
      result = await adapter.publish(cred, descriptor, { idempotencyKey: v.idempotencyKey, format: v.format, text: r.text, media, link: r.link, firstComment: r.firstComment, settings: v.settings });
    } catch (e) {
      if (e instanceof ProviderError && e.ambiguous) {
        // Reconcile BEFORE deciding anything (NFR-003: no duplicate publish).
        await db.update(publishJob).set({ state: "reconciling" }).where(eq(publishJob.id, job.id));
        l.warn("ambiguous publish result; reconciling");
        result = await adapter.findPublication(cred, descriptor, v.idempotencyKey);
        if (!result) {
          failure = err(e.category, e.message, e.providerCode, true);
          retryable = e.retryable;
        }
      } else throw e;
    }
  } catch (e) {
    const pe = e instanceof ProviderError ? e : new ProviderError(e instanceof Error ? e.message : "Unknown error", { category: "unknown", retryable: false });
    failure = err(pe.category, pe.message, pe.providerCode, pe.ambiguous);
    retryable = pe.retryable;
  }

  if (result) {
    await db.transaction(async (tx) => {
      await tx.update(postVariant).set({ status: "published", publishedAt: new Date(result!.publishedAt), remoteId: result!.remoteId, remoteUrl: result!.url ?? null, lastError: null, updatedAt: new Date() }).where(eq(postVariant.id, v.id));
      await tx
        .insert(remotePublication)
        .values({ variantId: v.id, channelId: ch.id, remoteId: result!.remoteId, url: result!.url ?? null, publishedAt: new Date(result!.publishedAt) })
        .onConflictDoNothing();
      await tx.update(publishJob).set({ state: "succeeded", finishedAt: new Date() }).where(eq(publishJob.id, job.id));
    });
    await summarizeItem(item.id);
    await audit({ action: "publish.succeeded", organizationId: item.organizationId, workspaceId: item.workspaceId, targetType: "post_variant", targetId: v.id, summary: { after: { remoteId: result.remoteId, channel: ch.name } } });
    l.info("published", { remoteId: result.remoteId });
    return;
  }

  // Failure path.
  if (retryable && job.attempt < MAX_ATTEMPTS) {
    const delay = failure?.category === "rate_limit" ? Math.max(backoffSeconds(job.attempt), 300) : backoffSeconds(job.attempt);
    const at = new Date(Date.now() + delay * 1000);
    await db.transaction(async (tx) => {
      await tx.update(publishJob).set({ state: "failed", finishedAt: new Date(), lastError: failure }).where(eq(publishJob.id, job.id));
      await tx.update(postVariant).set({ status: "scheduled", lastError: failure, updatedAt: new Date() }).where(eq(postVariant.id, v.id));
      const [next] = await tx.insert(publishJob).values({ workspaceId: item.workspaceId, variantId: v.id, versionId: job.versionId, scheduledFor: at, attempt: job.attempt + 1 }).returning({ id: publishJob.id });
      await emit(tx, "publish.execute", { publishJobId: next.id }, { organizationId: item.organizationId, workspaceId: item.workspaceId, dedupeKey: `publish:${next.id}`, runAt: at });
    });
    l.warn("publish failed; retry scheduled", { category: failure?.category, inSeconds: delay });
    return;
  }
  await finish(job.id, v, item, "failed", failure ?? err("unknown", "Publish failed"), l);
}

function err(category: string, message: string, providerCode?: string, ambiguous?: boolean): VariantError {
  return { category, message, providerCode, ambiguous, at: new Date().toISOString() };
}

async function finish(jobId: string, v: { id: string; channelId: string }, item: { id: string; organizationId: string; workspaceId: string; title: string; ownerUserId: string | null }, state: "failed", failure: VariantError, l: HandlerContext["log"]) {
  await db.transaction(async (tx) => {
    await tx.update(publishJob).set({ state, finishedAt: new Date(), lastError: failure }).where(eq(publishJob.id, jobId));
    await tx.update(postVariant).set({ status: "failed", lastError: failure, updatedAt: new Date() }).where(eq(postVariant.id, v.id));
  });
  await summarizeItem(item.id);
  const ch = await db.query.channel.findFirst({ where: (c, { eq }) => eq(c.id, v.channelId) });
  await audit({ action: "publish.failed", organizationId: item.organizationId, workspaceId: item.workspaceId, targetType: "post_variant", targetId: v.id, result: "error", summary: { note: `${failure.category}: ${failure.message}` } });
  await notify({
    workspaceId: item.workspaceId,
    organizationId: item.organizationId,
    userId: item.ownerUserId,
    kind: "publish.failed",
    title: `Post failed to publish to ${ch?.name ?? "a channel"}`,
    body: failure.message,
    href: `/app/${item.workspaceId}/posts/${item.id}`,
    email: true,
  });
  l.error("publish failed permanently", { category: failure.category, message: failure.message });
}
