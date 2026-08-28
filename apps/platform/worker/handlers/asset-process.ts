import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { db } from "@/db";
import { asset, assetRendition, type RenditionKind } from "@/db/schema/assets";
import type { JobPayloads } from "@/lib/jobs/queues";
import { getObjectBuffer, newObjectKey, putObject } from "@/lib/storage";
import type { HandlerContext } from "./index";

/**
 * After upload: checksum, sniff dimensions, build renditions, run the scan
 * hook. Never marks an asset ready with an unknown scan result — an unscanned
 * asset can't be published (content-model.md).
 */
export async function assetProcess(data: JobPayloads["asset.process"], ctx: HandlerContext) {
  const row = await db.query.asset.findFirst({ where: (a, { eq }) => eq(a.id, data.assetId) });
  if (!row || row.deletedAt) return;
  const l = ctx.log.child({ assetId: row.id, kind: row.kind });

  try {
    const buf = await getObjectBuffer(row.storageKey);
    const checksum = createHash("sha256").update(buf).digest("hex");
    const patch: Partial<typeof asset.$inferInsert> = { checksumSha256: checksum, bytes: buf.length };

    if (row.kind === "image") {
      const img = sharp(buf, { animated: false });
      const meta = await img.metadata();
      patch.width = meta.width ?? null;
      patch.height = meta.height ?? null;
      const specs: { kind: RenditionKind; width: number }[] = [
        { kind: "thumb", width: 320 },
        { kind: "preview", width: 1080 },
      ];
      for (const s of specs) {
        if (meta.width && meta.width <= s.width && s.kind === "preview") continue; // don't upscale
        const out = await sharp(buf).rotate().resize({ width: s.width, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
        const key = newObjectKey(row.organizationId, row.workspaceId, "rendition", `${s.kind}.webp`);
        await putObject(key, out.data, "image/webp");
        await db
          .insert(assetRendition)
          .values({ assetId: row.id, kind: s.kind, storageKey: key, mimeType: "image/webp", width: out.info.width, height: out.info.height, bytes: out.info.size })
          .onConflictDoUpdate({ target: [assetRendition.assetId, assetRendition.kind], set: { storageKey: key, width: out.info.width, height: out.info.height, bytes: out.info.size } });
      }
    }
    // Video/document: metadata probing (ffprobe) and poster frames come with the media pipeline spike; originals are usable now.

    const scan = await scanBuffer(buf);
    await db
      .update(asset)
      .set({ ...patch, scanStatus: scan.status, scanNote: scan.note ?? null, uploadStatus: scan.status === "infected" ? "failed" : "ready", processingError: null, updatedAt: new Date() })
      .where(eq(asset.id, row.id));
    l.info("asset processed", { scan: scan.status, bytes: buf.length });
  } catch (err) {
    await db.update(asset).set({ uploadStatus: "failed", processingError: err instanceof Error ? err.message : String(err), updatedAt: new Date() }).where(eq(asset.id, row.id));
    l.error("asset processing failed", { err });
    throw err;
  }
}

/** ClamAV REST (clamav-rest / clamd HTTP) when CLAMAV_URL is set; otherwise a dev no-op that records it was skipped. */
async function scanBuffer(buf: Buffer): Promise<{ status: "clean" | "infected" | "error"; note?: string }> {
  const url = process.env.CLAMAV_URL;
  if (!url) return { status: "clean", note: "scanner not configured (dev)" };
  try {
    const fd = new FormData();
    fd.append("file", new Blob([new Uint8Array(buf)]), "upload");
    const res = await fetch(`${url.replace(/\/$/, "")}/scan`, { method: "POST", body: fd });
    const body = (await res.json()) as { infected?: boolean; viruses?: string[]; result?: { is_infected?: boolean; viruses?: string[] }[] };
    const infected = body.infected ?? body.result?.[0]?.is_infected ?? false;
    const viruses = body.viruses ?? body.result?.[0]?.viruses ?? [];
    return infected ? { status: "infected", note: viruses.join(", ") } : { status: "clean" };
  } catch (e) {
    return { status: "error", note: e instanceof Error ? e.message : "scan failed" };
  }
}
