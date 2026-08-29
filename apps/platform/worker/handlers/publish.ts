import { and, eq } from "drizzle-orm";
import { ProviderError, type PublishResult } from "@make-it-social/providers";
import { db } from "@/db";
import { postVariant, publishJob, type VariantError } from "@/db/schema/content";
import { mediaForAssets, resolveVariant, validateVariant } from "@/lib/content";
import { toDisclosureInput } from "@/lib/disclosure";
import type { JobPayloads } from "@/lib/jobs/queues";
import { getAdapter, loadCredential, toDescriptor } from "@/lib/providers";
import type { HandlerContext } from "./index";
import { MAX_ATTEMPTS, err, finish, retryLater, succeed } from "./publish/outcome";

type Attempt = { result: PublishResult | null; failure: VariantError | null; retryable: boolean };

/**
 * Execute one publish job (architecture.md "Request and job patterns"):
 *   1. claim the job (queued → running); ignore if already handled
 *   2. re-validate token, capability, version, approval, asset rights
 *   3. publish with the variant's idempotency key
 *   4. success → remote publication; ambiguous → RECONCILE before any retry;
 *      retryable → new job with backoff; permanent → failed + notification
 */
export async function publishExecute(data: JobPayloads["publish.execute"], ctx: HandlerContext) {
  const [job] = await db.update(publishJob).set({ state: "running", startedAt: new Date() }).where(and(eq(publishJob.id, data.publishJobId), eq(publishJob.state, "queued"))).returning();
  if (!job) return; // canceled, or another worker took it
  const l = ctx.log.child({ publishJobId: job.id, variantId: job.variantId, attempt: job.attempt });

  const v = await db.query.postVariant.findFirst({ where: (p, { eq }) => eq(p.id, job.variantId) });
  const item = v ? await db.query.contentItem.findFirst({ where: (c, { eq }) => eq(c.id, v.contentItemId) }) : null;
  if (!v || !item || v.status !== "scheduled") return cancel(job.id);
  // Version pin: if the item moved on to a newer version, this job is stale.
  if (job.versionId && item.currentVersionId && job.versionId !== item.currentVersionId) return cancel(job.id, err("stale_version", "A newer version was scheduled"));
  if (item.approvalState === "pending" || item.approvalState === "changes_requested") return finish(job.id, v, item, err("approval", "Approval is no longer valid for this version"), l);

  const ch = await db.query.channel.findFirst({ where: (c, { eq }) => eq(c.id, v.channelId) });
  const conn = ch ? await db.query.providerConnection.findFirst({ where: (c, { eq }) => eq(c.id, ch.connectionId) }) : null;
  if (!ch || !conn || ["disconnected", "revoked"].includes(ch.status)) return finish(job.id, v, item, err("permission", "Channel is disconnected"), l);

  const blocking = (await validateVariant(item, v)).issues.filter((i) => i.severity === "error");
  if (blocking.length) return finish(job.id, v, item, err("validation", blocking[0].message, blocking[0].code), l);

  await db.update(postVariant).set({ status: "publishing", attempts: v.attempts + 1, updatedAt: new Date() }).where(eq(postVariant.id, v.id));
  const attempt = await tryPublish(conn, ch, item, v, job.id, l);
  if (attempt.result) return succeed(job, v, item, ch, attempt.result, l);
  if (attempt.retryable && job.attempt < MAX_ATTEMPTS) return retryLater(job, v, item, attempt.failure!, l);
  await finish(job.id, v, item, attempt.failure ?? err("unknown", "Publish failed"), l);
}

async function cancel(jobId: string, lastError?: VariantError) {
  await db.update(publishJob).set({ state: "canceled", finishedAt: new Date(), lastError: lastError ?? null }).where(eq(publishJob.id, jobId));
}

/** Publish once; an ambiguous provider error is reconciled with findPublication before it counts as a failure. */
async function tryPublish(conn: Parameters<typeof loadCredential>[0], ch: Parameters<typeof toDescriptor>[0], item: Parameters<typeof resolveVariant>[0], v: Parameters<typeof resolveVariant>[1], jobId: string, l: HandlerContext["log"]): Promise<Attempt> {
  const adapter = getAdapter(conn.provider);
  const descriptor = toDescriptor(ch);
  const r = resolveVariant(item, v);
  try {
    const cred = await loadCredential(conn);
    const { media } = await mediaForAssets(r.assetIds, { forPublish: true });
    try {
      const result = await adapter.publish(cred, descriptor, { idempotencyKey: v.idempotencyKey, format: v.format, text: r.text, media, link: r.link, firstComment: r.firstComment, settings: v.settings, disclosure: toDisclosureInput(item.syntheticMedia) });
      return { result, failure: null, retryable: false };
    } catch (e) {
      if (!(e instanceof ProviderError && e.ambiguous)) throw e;
      await db.update(publishJob).set({ state: "reconciling" }).where(eq(publishJob.id, jobId));
      l.warn("ambiguous publish result; reconciling");
      const result = await adapter.findPublication(cred, descriptor, v.idempotencyKey);
      if (result) await db.update(publishJob).set({ reconciled: true }).where(eq(publishJob.id, jobId));
      return result ? { result, failure: null, retryable: false } : { result: null, failure: err(e.category, e.message, e.providerCode, true), retryable: e.retryable };
    }
  } catch (e) {
    const pe = e instanceof ProviderError ? e : new ProviderError(e instanceof Error ? e.message : "Unknown error", { category: "unknown", retryable: false });
    return { result: null, failure: err(pe.category, pe.message, pe.providerCode, pe.ambiguous), retryable: pe.retryable };
  }
}
