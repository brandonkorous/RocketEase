/*
 * Video processing: probe for real duration and dimensions, then a poster frame
 * and a thumb derived from it.
 *
 * This is the defect fix. Until now a video upload got a checksum and nothing
 * else, so `Capabilities.limits.videoMaxSeconds` was validated against a
 * duration nothing ever learned, and an over-long clip failed at the provider
 * mid-publish instead of in the composer.
 *
 * Without ffprobe, duration stays NULL and a reason is recorded. Never 0 — an
 * unknown duration that reads as zero would silently pass every limit check.
 */
import sharp from "sharp";
import type { asset } from "@/db/schema/assets";
import { posterFrame, probeBuffer, wholeSeconds } from "@/lib/media/probe";
import { writeRendition } from "./renditions";
import type { AssetRef } from "./image";

type Patch = Partial<typeof asset.$inferInsert>;

export type MediaOutcome = { patch: Patch; note: string | null };

export async function processVideo(row: AssetRef, buf: Buffer, fileName: string): Promise<MediaOutcome> {
  const { probe, unavailableReason } = await probeBuffer(buf, fileName);
  const patch: Patch = {
    durationSeconds: wholeSeconds(probe.durationSeconds),
    width: probe.width,
    height: probe.height,
  };

  const poster = await posterFrame(buf, probe.durationSeconds, fileName);
  if (poster) {
    const png = await sharp(poster).metadata();
    await writeRendition({
      organizationId: row.organizationId,
      workspaceId: row.workspaceId,
      assetId: row.id,
      kind: "poster",
      bytes: poster,
      mimeType: "image/png",
      extension: ".png",
      width: png.width ?? null,
      height: png.height ?? null,
    });
    // A thumb from the poster, so the library grid looks the same for video as for images.
    const thumb = await sharp(poster).resize({ width: 320, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
    await writeRendition({
      organizationId: row.organizationId,
      workspaceId: row.workspaceId,
      assetId: row.id,
      kind: "thumb",
      bytes: thumb.data,
      mimeType: "image/webp",
      extension: ".webp",
      width: thumb.info.width,
      height: thumb.info.height,
    });
  }

  return { patch, note: unavailableReason };
}
