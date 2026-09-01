/*
 * Run a generation now if the vendor can answer now; queue it properly if not.
 *
 * One entry point, because the caller should not have to know which kind of
 * vendor routing picked. A synchronous adapter hands the picture back while the
 * person is still looking at the card; anything else takes the ordinary queued
 * path, and the answer says so plainly rather than pretending to fail.
 *
 * An adapter that keeps job state in memory MUST go through the queue: started
 * in the web process and polled in the worker, its job would not be found.
 */
import { eq } from "drizzle-orm";
import { buildRegistry, MediaError, type MediaAdapter, type MediaJobState as VendorState } from "@rocketease/media";
import { db } from "@/db";
import { mediaJob, type MediaJob } from "@/db/schema/media";
import { emit } from "@/lib/jobs/outbox";
import { log } from "@/lib/log";
import { completeMediaJob, endMediaJob } from "./finish";
import { auditGeneration, enqueueJob, jobValues, prepareJob, type CreateJobInput } from "./jobs";
import { hydrateReferences } from "./hydrate-references";

export type RunNowResult =
  | { mediaJobId: string; assetIds: string[]; mismatches: string[] }
  | { mediaJobId: string; pending: true }
  | { error: string };

const GENERIC = "The model didn't return anything. Nothing was generated.";

/** Reconcile before starting: an earlier attempt may already have been billed. */
async function submit(row: MediaJob, adapter: MediaAdapter) {
  const existing = await adapter.reconcile(row.idempotencyKey);
  if (existing) {
    log.warn("media job already existed at the vendor; not re-spending", { mediaJobId: row.id });
    return existing.handle;
  }
  const model = adapter.models().find((m) => m.key === row.modelKey);
  if (!model) throw new MediaError("That model is no longer offered.", { category: "unconfigured" });
  const hydrated = await hydrateReferences(row.spec as never, model, row.workspaceId);
  return adapter.start(model, hydrated, row.idempotencyKey);
}

export async function runMediaJobNow(input: CreateJobInput): Promise<RunNowResult> {
  const prepared = await prepareJob(input);
  if ("error" in prepared) return prepared;

  const adapter = buildRegistry().get(prepared.model.adapter);
  if (!adapter?.configured()) return { error: `The ${prepared.model.adapter} adapter isn't configured, so nothing was generated.` };
  if (!adapter.synchronous) {
    const queued = await enqueueJob(input, prepared);
    return "error" in queued ? queued : { mediaJobId: queued.mediaJobId, pending: true };
  }

  const [row] = await db.insert(mediaJob).values(jobValues(input, prepared, "running")).returning();
  await auditGeneration(input, prepared, row.id);

  try {
    const handle = await submit(row, adapter);
    await db.update(mediaJob).set({ remoteJobId: handle.remoteJobId, startedAt: new Date(), updatedAt: new Date() }).where(eq(mediaJob.id, row.id));

    const state: VendorState = await adapter.poll(handle);
    // Declared synchronous and wasn't. Hand it to the poller rather than block.
    if (state.status === "queued" || state.status === "running") return handOff(row);
    if (state.status !== "succeeded") {
      await endMediaJob(row.id, { category: state.error?.category ?? "unknown", note: state.error?.message ?? GENERIC });
      return { error: state.error?.message ?? GENERIC };
    }

    const { assetIds, mismatches } = await completeMediaJob({ ...row, remoteJobId: handle.remoteJobId }, prepared.model, adapter, state);
    if (!assetIds.length) return { error: "The model returned a file we couldn't read." };
    return { mediaJobId: row.id, assetIds, mismatches };
  } catch (err) {
    const message = err instanceof MediaError ? err.message : GENERIC;
    log.error("inline media job failed", { mediaJobId: row.id, err });
    await endMediaJob(row.id, { category: err instanceof MediaError ? err.category : "unknown", note: message });
    return { error: message };
  }
}

async function handOff(row: MediaJob): Promise<RunNowResult> {
  await db.transaction(async (tx) => {
    await emit(tx, "media.poll", { mediaJobId: row.id }, {
      organizationId: row.organizationId,
      workspaceId: row.workspaceId,
      dedupeKey: `media.poll:${row.id}`,
    });
  });
  return { mediaJobId: row.id, pending: true };
}
