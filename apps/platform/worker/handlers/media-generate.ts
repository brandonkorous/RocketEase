/*
 * Submit one generation to a vendor.
 *
 * This is a SPEND mutation, so it follows the publishing discipline exactly:
 *   - the queue is `stately` with retryLimit 0 — nothing retries blindly
 *   - the idempotency key is never bypassed
 *   - before starting, we ASK THE VENDOR whether this key already has a job
 *
 * That last step is the one that matters. If a previous attempt reached the
 * vendor and we lost the answer, starting again bills twice.
 */
import { eq } from "drizzle-orm";
import { buildRegistry, modelByKey } from "@rocketease/media";
import { db } from "@/db";
import { mediaJob } from "@/db/schema/media";
import type { JobPayloads } from "@/lib/jobs/queues";
import { emit } from "@/lib/jobs/outbox";
import type { HandlerContext } from "./index";

export async function mediaGenerate(data: JobPayloads["media.generate"], ctx: HandlerContext) {
  const row = await db.query.mediaJob.findFirst({ where: (j, { eq: e }) => e(j.id, data.mediaJobId) });
  if (!row) return;
  const l = ctx.log.child({ mediaJobId: row.id, model: row.modelKey });
  // Terminal or already submitted: a redelivery must not start a second job.
  if (row.state !== "queued") {
    l.info("media job already past queued", { state: row.state });
    return;
  }

  const model = modelByKey(row.modelKey);
  const adapter = buildRegistry().get(row.adapter);
  if (!model || !adapter?.configured()) {
    await failJob(row.id, "unconfigured", `The ${row.adapter} adapter isn't configured, so nothing was generated.`);
    return;
  }

  try {
    // Reconcile FIRST: an earlier attempt may have reached the vendor and we
    // may simply have lost the answer. Starting again would bill twice.
    const existing = await adapter.reconcile(row.idempotencyKey);
    let remoteJobId: string;
    if (existing) {
      remoteJobId = existing.handle.remoteJobId;
      l.warn("media job already existed at the vendor; not re-spending", { remoteJobId });
    } else {
      const handle = await adapter.start(model, row.spec as never, row.idempotencyKey);
      remoteJobId = handle.remoteJobId;
    }

    await db
      .update(mediaJob)
      .set({ state: "running", remoteJobId, startedAt: new Date(), updatedAt: new Date() })
      .where(eq(mediaJob.id, row.id));

    await db.transaction(async (tx) => {
      await emit(tx, "media.poll", { mediaJobId: row.id }, {
        organizationId: row.organizationId,
        workspaceId: row.workspaceId,
        dedupeKey: `media.poll:${row.id}`,
      });
    });
    l.info("media job submitted", { remoteJobId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    l.error("media job submission failed", { err });
    await failJob(row.id, "unknown", "The model didn't accept the request. Nothing was generated.", message);
  }
}

async function failJob(id: string, category: string, note: string, detail?: string) {
  await db
    .update(mediaJob)
    .set({ state: "failed", errorCategory: category, errorNote: note, finishedAt: new Date(), updatedAt: new Date(), mismatches: detail ? [detail] : [] })
    .where(eq(mediaJob.id, id));
}
