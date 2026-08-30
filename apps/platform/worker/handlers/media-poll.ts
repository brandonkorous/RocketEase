/*
 * Advance running generations, and pull the bytes the moment one completes.
 *
 * The deadline is real: vendor delivery URLs expire (Sora: ~1 hour), and a
 * paid-for render we failed to fetch is money burned for nothing. So a
 * succeeded job is fetched and normalized in the same tick, not queued for later.
 */
import { and, eq, inArray, lt } from "drizzle-orm";
import { buildRegistry, modelByKey, type MediaJobState as VendorState } from "@rocketease/media";
import { db } from "@/db";
import { mediaJob, type MediaJob } from "@/db/schema/media";
import { normalizeOutputs } from "@/lib/media/normalize";
import type { JobPayloads } from "@/lib/jobs/queues";
import type { HandlerContext } from "./index";

/** Jobs picked up per sweep when no specific id is given. */
const SWEEP_LIMIT = 25;

export async function mediaPoll(data: JobPayloads["media.poll"], ctx: HandlerContext) {
  const rows = data.mediaJobId
    ? await db.select().from(mediaJob).where(eq(mediaJob.id, data.mediaJobId))
    : await db
        .select()
        .from(mediaJob)
        .where(and(inArray(mediaJob.state, ["queued", "running"]), lt(mediaJob.updatedAt, new Date(Date.now() + 1))))
        .limit(SWEEP_LIMIT);

  for (const row of rows) {
    if (row.state !== "running" || !row.remoteJobId) continue;
    await advance(row, ctx);
  }
}

async function advance(row: MediaJob, ctx: HandlerContext) {
  const l = ctx.log.child({ mediaJobId: row.id, model: row.modelKey });
  const model = modelByKey(row.modelKey);
  const adapter = buildRegistry().get(row.adapter);
  if (!model || !adapter?.configured()) return;

  let state: VendorState;
  try {
    state = await adapter.poll({ adapter: row.adapter, modelKey: row.modelKey, remoteJobId: row.remoteJobId!, idempotencyKey: row.idempotencyKey });
  } catch (err) {
    l.warn("media poll failed; leaving the job running to retry", { err });
    return; // Never fail a job on a poll error — the vendor may still be working.
  }

  if (state.status === "running" || state.status === "queued") {
    await db.update(mediaJob).set({ updatedAt: new Date() }).where(eq(mediaJob.id, row.id));
    return;
  }

  if (state.status === "failed" || state.status === "cancelled") {
    await db
      .update(mediaJob)
      .set({
        state: state.status,
        errorCategory: state.error?.category ?? "unknown",
        errorNote: state.error?.message ?? "The model didn't return anything.",
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(mediaJob.id, row.id));
    l.info("media job ended", { state: state.status });
    return;
  }

  // Succeeded: fetch NOW, before the URL expires.
  try {
    const outputs = await adapter.fetch(state);
    const { assetIds, mismatches } = await normalizeOutputs({
      actor: { organizationId: row.organizationId, workspaceId: row.workspaceId, userId: row.requestedByUserId },
      mediaJobId: row.id,
      modelKey: row.modelKey,
      outputs,
      provenance: {
        // What the model attached. Our own render will strip it later; that is
        // recorded then, so the chain never silently loses a credential.
        c2pa: model.provenance.c2pa ? "signed" : "absent",
        watermark: model.provenance.watermark,
        chain: [{ action: "generated", adapter: row.adapter, model: row.modelKey }],
      },
    });

    await db
      .update(mediaJob)
      .set({
        state: "succeeded",
        assetIds,
        mismatches,
        quantity: state.usage ? String(state.usage.quantity) : null,
        unit: state.usage?.unit ?? null,
        // Null when the vendor says nothing — never a guessed 0.
        vendorCostUsd: state.usage?.costUsd === undefined ? null : String(state.usage.costUsd),
        outputExpiresAt: state.expiresAt ? new Date(state.expiresAt) : null,
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(mediaJob.id, row.id));
    l.info("media job succeeded", { assets: assetIds.length, mismatches: mismatches.length });
  } catch (err) {
    l.error("media output fetch failed", { err });
    await db
      .update(mediaJob)
      .set({
        state: "failed",
        errorCategory: "temporary",
        errorNote: "The model finished, but its output couldn't be retrieved before it expired.",
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(mediaJob.id, row.id));
  }
}
