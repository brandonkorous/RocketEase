/*
 * Tile pictures. A video with a chosen cover shows THAT frame — the point of the
 * cover picker is that the grid shows what the profile will show. Otherwise the
 * thumb rendition, else the original when it is an image. Never a broken tile:
 * a post without a picture gets null and the tile draws its own placeholder.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { asset, assetFrame, assetRendition } from "@/db/schema/assets";
import { presignGet } from "@/lib/storage";

export type TileMedia = { thumbUrl: string | null; isVideo: boolean; videoAssetId: string | null };

/** One lookup for every tile; `covers` maps an asset id to the frame id its post chose. */
export async function tileMedia(assetIds: string[], covers: Map<string, string>): Promise<Map<string, TileMedia>> {
  const ids = [...new Set(assetIds)];
  const out = new Map<string, TileMedia>();
  if (ids.length === 0) return out;
  const [rows, thumbs, frames] = await Promise.all([
    db.select({ id: asset.id, kind: asset.kind, key: asset.storageKey }).from(asset).where(inArray(asset.id, ids)),
    db.select().from(assetRendition).where(and(inArray(assetRendition.assetId, ids), eq(assetRendition.kind, "thumb"))),
    covers.size ? db.select().from(assetFrame).where(inArray(assetFrame.id, [...covers.values()])) : Promise.resolve([]),
  ]);
  for (const a of rows) {
    const frame = frames.find((f) => f.id === covers.get(a.id) && f.assetId === a.id);
    const thumb = thumbs.find((t) => t.assetId === a.id);
    const key = frame?.storageKey ?? thumb?.storageKey ?? (a.kind === "image" ? a.key : null);
    out.set(a.id, { thumbUrl: key ? await presignGet(key) : null, isVideo: a.kind === "video", videoAssetId: a.kind === "video" ? a.id : null });
  }
  return out;
}
