/*
 * Burn one caption track into one asset, for one placement.
 *
 * Placement matters here for exactly one reason and it is the good one: the
 * caption's bottom margin comes from that placement's safe zone, so a 9:16 Reels
 * cut puts its captions above the 35% band the platform draws over. Captions
 * inherit the safe-zone discipline the ad compositor already has.
 *
 * Always writes a NEW asset. The un-captioned original stays exactly as it was,
 * because it may already be attached to a published post.
 */
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { asset, type Asset } from "@/db/schema/assets";
import { captionTrack } from "@/db/schema/voice";
import { loadBrandKit } from "@/lib/brand/load";
import { isPlacement, specFor } from "@/lib/media/canvas/specs";
import { swatch } from "@/lib/media/compose/spec";
import { getObjectBuffer } from "@/lib/storage";
import { styleForPlacement } from "./captions/ass";
import { burnCaptions } from "./captions/burn";
import { buildCues, tooFastToRead } from "./captions/cues";
import { writeDerivedAsset } from "./render-store";

export type CaptionBurnInput = { assetId: string; captionTrackId: string; placement: string };
export type CaptionBurnResult = { assetId: string; notes: string[] } | { error: string };

const extensionOf = (fileName: string, mimeType: string) => {
  const m = /\.[a-z0-9]{2,5}$/i.exec(fileName);
  if (m) return m[0].toLowerCase();
  return mimeType === "video/quicktime" ? ".mov" : ".mp4";
};

/** Caption type follows the brand's body face and text colour, like every other overlay. */
async function styleFor(placement: Parameters<typeof specFor>[0], workspaceId: string) {
  const kit = await loadBrandKit(workspaceId);
  return styleForPlacement(specFor(placement), {
    fontFamily: kit.visual?.typography?.bodyFamily?.trim() || "",
    textHex: swatch(kit, "surface"),
    outlineHex: swatch(kit, "primary"),
  });
}

export async function burnCaptionTrack(input: CaptionBurnInput): Promise<CaptionBurnResult> {
  if (!isPlacement(input.placement)) return { error: `Unknown placement “${input.placement}”.` };

  const [source] = await db.select().from(asset).where(and(eq(asset.id, input.assetId), isNull(asset.deletedAt)));
  if (!source) return { error: "That video is no longer in the library." };
  if (source.kind !== "video") return { error: "Captions can only be burned into a video." };

  const [track] = await db.select().from(captionTrack).where(eq(captionTrack.id, input.captionTrackId));
  // Workspace-scoped: a track id is just a string, and it must not reach across tenants.
  if (!track || track.assetId !== source.id || track.workspaceId !== source.workspaceId) {
    return { error: "That caption track does not belong to this video." };
  }

  const spec = specFor(input.placement);
  const cues = buildCues(track.words);
  if (!cues.length) return { error: "This caption track has no words to show." };

  const result = await burnCaptions({
    video: await getObjectBuffer(source.storageKey),
    cues,
    style: await styleFor(input.placement, source.workspaceId),
    // The video's OWN dimensions, not the placement's: libass scales margins to
    // PlayRes, so declaring a size the file does not have moves the captions.
    width: source.width ?? spec.width,
    height: source.height ?? spec.height,
    sourceExtension: extensionOf(source.fileName, source.mimeType),
  });
  if (!result.ok) return { error: result.reason };

  const notes: string[] = [];
  const fast = tooFastToRead(cues);
  if (fast.length) {
    notes.push(`${fast.length} caption${fast.length === 1 ? "" : "s"} may go by too quickly to read comfortably.`);
  }
  if (source.width == null || source.height == null) {
    notes.push("This video's dimensions were never probed, so the caption margins used the placement's nominal size.");
  }

  const assetId = await writeDerivedAsset({
    actor: { organizationId: source.organizationId, workspaceId: source.workspaceId, userId: track.createdByUserId },
    base: source as Asset,
    bytes: result.bytes,
    mimeType: result.mimeType,
    width: source.width,
    height: source.height,
    fileName: `${source.fileName.replace(/\.[^.]+$/, "")}-captions-${track.language}${result.extension}`,
    altText: source.altText,
    action: `captions burned in (${track.language}, ${spec.label})`,
  });

  return { assetId, notes };
}
