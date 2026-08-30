import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { asset } from "@/db/schema/assets";
import type { JobPayloads } from "@/lib/jobs/queues";
import { getObjectBuffer } from "@/lib/storage";
import type { HandlerContext } from "./index";
import { processAudio } from "./asset/audio";
import { processImage } from "./asset/image";
import { scanBuffer } from "./asset/scan";
import { processVideo } from "./asset/video";

/**
 * After upload: checksum, probe, build renditions, run the scan hook. Never
 * marks an asset ready with an unknown scan result — an unscanned asset can't
 * be published (content-model.md).
 *
 * Per-kind work lives in ./asset/*; this stays orchestration.
 */
export async function assetProcess(data: JobPayloads["asset.process"], ctx: HandlerContext) {
  const row = await db.query.asset.findFirst({ where: (a, { eq }) => eq(a.id, data.assetId) });
  if (!row || row.deletedAt) return;
  const l = ctx.log.child({ assetId: row.id, kind: row.kind });

  try {
    const buf = await getObjectBuffer(row.storageKey);
    const checksum = createHash("sha256").update(buf).digest("hex");
    let patch: Partial<typeof asset.$inferInsert> = { checksumSha256: checksum, bytes: buf.length };
    /** Why something is unknown — surfaced, never swallowed into a zero. */
    let note: string | null = null;

    if (row.kind === "image") {
      patch = { ...patch, ...(await processImage(row, buf)) };
    } else if (row.kind === "video") {
      const out = await processVideo(row, buf, row.fileName);
      patch = { ...patch, ...out.patch };
      note = out.note;
    } else if (row.kind === "audio") {
      const out = await processAudio(row, buf, row.fileName);
      patch = { ...patch, ...out.patch };
      note = out.note;
    }

    const scan = await scanBuffer(buf);
    await db
      .update(asset)
      .set({
        ...patch,
        scanStatus: scan.status,
        scanNote: scan.note ?? null,
        uploadStatus: scan.status === "infected" ? "failed" : "ready",
        // An un-probed asset is READY but carries the reason; it is not a failure.
        processingError: note,
        updatedAt: new Date(),
      })
      .where(eq(asset.id, row.id));
    l.info("asset processed", { scan: scan.status, bytes: buf.length, durationSeconds: patch.durationSeconds ?? null, note });
  } catch (err) {
    await db
      .update(asset)
      .set({ uploadStatus: "failed", processingError: err instanceof Error ? err.message : String(err), updatedAt: new Date() })
      .where(eq(asset.id, row.id));
    l.error("asset processing failed", { err });
    throw err;
  }
}
