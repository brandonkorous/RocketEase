/*
 * The chosen cover frame, as the variant records it and as publishing sends it.
 * `settings.cover` is the author's choice; the frame row is the picture. Publishing
 * sends BOTH the offset and a signed picture, so an adapter that takes either has
 * what it needs, and a frame that no longer belongs to the post's video is dropped
 * rather than sent to the wrong clip.
 */
import { eq } from "drizzle-orm";
import type { PublishCover } from "@rocketease/providers";
import { db } from "@/db";
import { assetFrame } from "@/db/schema/assets";
import { presignGet } from "@/lib/storage";

export type CoverSetting = { frameId: string; offsetMs: number };

/** Read `settings.cover` defensively: the column is untyped JSON. */
export function coverSetting(settings: Record<string, unknown> | null | undefined): CoverSetting | null {
  const c = settings?.cover as Partial<CoverSetting> | undefined;
  if (!c || typeof c.frameId !== "string" || typeof c.offsetMs !== "number") return null;
  return { frameId: c.frameId, offsetMs: c.offsetMs };
}

/** What the adapter gets, or nothing when no valid choice exists for this post's media. */
export async function coverForPublish(settings: Record<string, unknown> | null | undefined, assetIds: string[]): Promise<PublishCover | undefined> {
  const chosen = coverSetting(settings);
  if (!chosen) return undefined;
  const frame = await db.query.assetFrame.findFirst({ where: (f, { eq }) => eq(f.id, chosen.frameId) });
  if (!frame || !assetIds.includes(frame.assetId)) return undefined;
  return { offsetMs: frame.offsetMs, imageUrl: await presignGet(frame.storageKey) };
}

/** Frames pulled for one video, oldest offset first. */
export function framesForAsset(assetId: string) {
  return db.select().from(assetFrame).where(eq(assetFrame.assetId, assetId)).orderBy(assetFrame.offsetMs);
}
