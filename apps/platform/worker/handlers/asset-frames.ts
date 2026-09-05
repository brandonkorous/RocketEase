/*
 * Candidate cover frames for a video: stills spaced across the clip, one
 * asset_frame row each. Pulled on request from the Grid's cover picker, never on
 * upload — most clips never need one. Idempotent on (asset, offset), so a retry
 * writes nothing twice; a frame ffmpeg cannot produce is logged and skipped,
 * never replaced by a blank.
 */
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { assetFrame, type Asset } from "@/db/schema/assets";
import { DEFAULT_FRAME_COUNT, frameOffsets } from "@/lib/grid/frames";
import type { JobPayloads } from "@/lib/jobs/queues";
import { frameAt } from "@/lib/media/probe";
import { getObjectBuffer, newObjectKey, putObject } from "@/lib/storage";
import type { HandlerContext } from "./index";

const FRAME_WIDTH = 640;

export async function assetFrames(data: JobPayloads["asset.frames"], ctx: HandlerContext) {
  const row = await db.query.asset.findFirst({ where: (a, { eq }) => eq(a.id, data.assetId) });
  if (!row || row.deletedAt || row.kind !== "video" || row.uploadStatus !== "ready") return;
  const l = ctx.log.child({ assetId: row.id });

  const existing = await db.select({ offsetMs: assetFrame.offsetMs }).from(assetFrame).where(eq(assetFrame.assetId, row.id));
  const have = new Set(existing.map((e) => e.offsetMs));
  const wanted = frameOffsets(row.durationSeconds, data.count ?? DEFAULT_FRAME_COUNT).filter((o) => !have.has(o));
  if (wanted.length === 0) return;

  const buf = await getObjectBuffer(row.storageKey);
  let written = 0;
  for (const offsetMs of wanted) {
    if (ctx.signal.aborted) break;
    const png = await frameAt(buf, offsetMs / 1000, row.fileName);
    if (!png) {
      l.warn("cover frame unavailable", { offsetMs });
      continue;
    }
    await writeFrame(row, offsetMs, png);
    written++;
  }
  l.info("cover frames pulled", { written, wanted: wanted.length });
}

async function writeFrame(row: Asset, offsetMs: number, png: Buffer) {
  const out = await sharp(png).resize({ width: FRAME_WIDTH, withoutEnlargement: true }).webp({ quality: 84 }).toBuffer({ resolveWithObject: true });
  const key = newObjectKey(row.organizationId, row.workspaceId, "rendition", `frame-${offsetMs}.webp`);
  await putObject(key, out.data, "image/webp");
  await db
    .insert(assetFrame)
    .values({ organizationId: row.organizationId, workspaceId: row.workspaceId, assetId: row.id, offsetMs, storageKey: key, mimeType: "image/webp", width: out.info.width, height: out.info.height, bytes: out.data.byteLength })
    .onConflictDoNothing();
}
