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
import { completeMediaJob, endMediaJob } from "@/lib/media/finish";
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
    await endMediaJob(row.id, {
      state: state.status,
      category: state.error?.category ?? "unknown",
      note: state.error?.message ?? "The model didn't return anything.",
    });
    l.info("media job ended", { state: state.status });
    return;
  }

  // Succeeded: fetch NOW, before the URL expires.
  try {
    const { assetIds, mismatches } = await completeMediaJob(row, model, adapter, state);
    l.info("media job succeeded", { assets: assetIds.length, mismatches: mismatches.length });
  } catch (err) {
    l.error("media output fetch failed", { err });
    await endMediaJob(row.id, { category: "temporary", note: "The model finished, but its output couldn't be retrieved before it expired." });
  }
}
