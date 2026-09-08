/*
 * import.canva (M14.9): export one design at Canva, wait for the render, and
 * write each page's bytes into the asset rows the action reserved, in page
 * order. Every row ends `processing` (asset.process takes it from there) or
 * `failed` with Canva's words; nothing is left `pending` for ever. A retry
 * makes a new export job, which is safe: an export is a render, not state.
 */
import { eq, inArray } from "drizzle-orm";
import { ProviderError } from "@rocketease/providers";
import { db } from "@/db";
import { asset } from "@/db/schema/assets";
import { createCanvaExport, getCanvaExport, MIME, type CanvaExportJob, type ImportFormat } from "@/lib/import/canva";
import { accessTokenFor } from "@/lib/import/sources";
import type { JobPayloads } from "@/lib/jobs/queues";
import { emit } from "@/lib/jobs/outbox";
import { putObject } from "@/lib/storage";
import type { HandlerContext } from "./index";

type Row = typeof asset.$inferSelect;
const POLL_MS = 2_500;
/** About a minute; Canva renders most designs in seconds. Past this the job retries with a fresh export. */
const POLL_TRIES = 24;

async function failAssets(ids: string[], why: string) {
  if (ids.length) await db.update(asset).set({ uploadStatus: "failed", processingError: why.slice(0, 500), updatedAt: new Date() }).where(inArray(asset.id, ids));
}

async function waitForExport(token: string, job: CanvaExportJob, signal: AbortSignal): Promise<CanvaExportJob> {
  let current = job;
  for (let i = 0; i < POLL_TRIES && current.status === "in_progress"; i++) {
    if (signal.aborted) throw new ProviderError("Worker is shutting down", { category: "temporary" });
    await new Promise((r) => setTimeout(r, POLL_MS));
    current = await getCanvaExport(token, job.id);
  }
  if (current.status === "in_progress") throw new ProviderError("Canva is still rendering the export", { category: "temporary" });
  return current;
}

/** One page's bytes into the row's own object key, then the normal processing pipeline (renditions, scan). */
async function storePage(row: Row, url: string, format: ImportFormat, exportId: string, page: number, pages: number) {
  const res = await fetch(url);
  if (!res.ok) throw new ProviderError(`Canva's download answered ${res.status}`, { category: res.status >= 500 ? "temporary" : "unknown" });
  const buf = Buffer.from(await res.arrayBuffer());
  await putObject(row.storageKey, buf, MIME[format]);
  const chain = [...(row.provenance?.chain ?? []), { action: "imported", adapter: "canva", ref: exportId, detail: `page ${page} of ${pages}, exported as ${format.toUpperCase()}` }];
  await db.transaction(async (tx) => {
    await tx.update(asset).set({ uploadStatus: "processing", bytes: buf.length, provenance: { c2pa: row.provenance?.c2pa ?? "absent", watermark: row.provenance?.watermark ?? null, chain }, updatedAt: new Date() }).where(eq(asset.id, row.id));
    await emit(tx, "asset.process", { assetId: row.id }, { organizationId: row.organizationId, workspaceId: row.workspaceId, dedupeKey: `asset.process:${row.id}` });
  });
}

export async function importCanva(data: JobPayloads["import.canva"], ctx: HandlerContext) {
  const rows = await db.select().from(asset).where(inArray(asset.id, data.assetIds));
  const waiting = new Map(rows.filter((r) => r.uploadStatus === "pending" && !r.deletedAt).map((r) => [r.id, r]));
  if (!waiting.size) return;
  const ids = [...waiting.keys()];
  const l = ctx.log.child({ sourceId: data.sourceId, designId: data.designId, assets: ids.length });
  let token: string;
  try {
    token = await accessTokenFor(data.sourceId);
  } catch (e) {
    return failAssets(ids, e instanceof Error ? e.message : "Canva is not connected.");
  }
  try {
    const job = await waitForExport(token, await createCanvaExport(token, data.designId, data.format), ctx.signal);
    if (job.status === "failed") return failAssets(ids, `Canva could not export this design: ${job.error?.message ?? job.error?.code ?? "no reason given"}.`);
    const urls = job.urls ?? [];
    for (const [i, id] of data.assetIds.entries()) {
      const row = waiting.get(id);
      if (!row) continue;
      if (!urls[i]) await failAssets([id], `Canva exported ${urls.length} page${urls.length === 1 ? "" : "s"}; this file was to be page ${i + 1}.`);
      else await storePage(row, urls[i], data.format, job.id, i + 1, urls.length);
    }
    l.info("canva design imported", { pages: urls.length, exportId: job.id });
  } catch (e) {
    if (e instanceof ProviderError && e.retryable) throw e; // pg-boss retries; the rows stay pending until it gives up
    await failAssets(ids, e instanceof Error ? e.message : "Import failed.");
    l.warn("canva import failed", { err: e });
  }
}
