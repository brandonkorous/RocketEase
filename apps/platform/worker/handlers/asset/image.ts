/*
 * Image processing: dimensions plus thumb and preview renditions.
 * Unchanged behaviour from the original asset.process — only relocated.
 */
import sharp from "sharp";
import type { asset, AssetProvenance, RenditionKind } from "@/db/schema/assets";
import { writeRendition } from "./renditions";

type Patch = Partial<typeof asset.$inferInsert>;
export type AssetRef = { id: string; organizationId: string; workspaceId: string; provenance?: AssetProvenance | null };

const SPECS: { kind: RenditionKind; width: number }[] = [
  { kind: "thumb", width: 320 },
  { kind: "preview", width: 1080 },
];

export async function processImage(row: AssetRef, buf: Buffer): Promise<Patch> {
  const meta = await sharp(buf, { animated: false }).metadata();
  const patch: Patch = { width: meta.width ?? null, height: meta.height ?? null };

  for (const s of SPECS) {
    if (meta.width && meta.width <= s.width && s.kind === "preview") continue; // don't upscale
    const out = await sharp(buf).rotate().resize({ width: s.width, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
    await writeRendition({
      organizationId: row.organizationId,
      workspaceId: row.workspaceId,
      assetId: row.id,
      kind: s.kind,
      bytes: out.data,
      mimeType: "image/webp",
      extension: ".webp",
      width: out.info.width,
      height: out.info.height,
      // A WebP transcode carries no C2PA manifest, so a signed original comes out
      // stripped. Publishing sends this file, so that has to be on the record.
      sourceCredential: row.provenance?.c2pa,
    });
  }
  return patch;
}
