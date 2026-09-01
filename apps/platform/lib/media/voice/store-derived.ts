/*
 * Storing the finished clip.
 *
 * Captions are burned HERE, immediately before the write, so one job produces
 * one finished file rather than a chain of half-finished ones sitting in the
 * library. The words are still recorded as a caption_track: they are the source
 * of truth, and somebody has to be able to fix a misheard one and re-burn.
 *
 * A derived asset INHERITS its source's rights envelope. It is the same footage
 * with a voice on top, so it cannot be cleared for more than the source was.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { asset, type Asset } from "@/db/schema/assets";
import { emit } from "@/lib/jobs/outbox";
import { log } from "@/lib/log";
import { newObjectKey, putObject } from "@/lib/storage";
import { burnCaptions } from "../captions/burn";
import { credentialForDerived } from "../c2pa";
import { upsertCaptionTrack } from "../captions/store";
import type { CaptionResult } from "./captions";

export type StoreInput = {
  source: Asset;
  bytes: Buffer;
  caption: CaptionResult | null;
  userId: string | null;
  modelKey: string | null;
};

export async function storeDerived(input: StoreInput): Promise<{ assetId: string } | { error: string }> {
  const { source } = input;
  let bytes = input.bytes;

  if (input.caption?.cues.length) {
    const burned = await burnCaptions({
      video: bytes,
      cues: input.caption.cues,
      style: input.caption.style,
      width: source.width ?? 720,
      height: source.height ?? 1280,
      sourceExtension: ".mp4",
    });
    // A burn that fails must not lose the voice-over: the clip is still better
    // with sound and no captions than not written at all.
    if (burned.ok) bytes = burned.bytes;
    else log.warn("captions could not be burned in; storing the voiced clip without them", { reason: burned.reason, sourceAssetId: source.id });
  }

  const fileName = source.fileName.replace(/(\.[^.]+)?$/, "-voiced.mp4");
  const key = newObjectKey(source.organizationId, source.workspaceId, "original", fileName);
  await putObject(key, bytes, "video/mp4");

  const [row] = await db
    .insert(asset)
    .values({
      organizationId: source.organizationId,
      workspaceId: source.workspaceId,
      storageKey: key,
      fileName,
      title: source.title ? `${source.title} (voiced)` : null,
      kind: "video",
      mimeType: "video/mp4",
      bytes: bytes.byteLength,
      width: source.width,
      height: source.height,
      durationSeconds: source.durationSeconds,
      uploadStatus: "ready",
      // Same footage with a voice on it — it cannot be cleared for more.
      rightsNote: source.rightsNote,
      rightsExpiresAt: source.rightsExpiresAt,
      rightsScope: source.rightsScope,
      licenseSource: source.licenseSource,
      platformClearance: source.platformClearance,
      altText: source.altText,
      generatedByAi: true,
      generationModel: input.modelKey,
      derivedFromAssetId: source.id,
      uploadedByUserId: input.userId,
      provenance: {
        ...(source.provenance ?? {}),
        watermark: source.provenance?.watermark ?? null,
        // Re-encoding strips C2PA. Recorded, never quietly lost.
        c2pa: credentialForDerived(bytes, source.provenance?.c2pa),
        chain: [...(source.provenance?.chain ?? []), { action: "voiceover", adapter: "azure-speech", model: input.modelKey ?? "unknown" }],
      },
    })
    .returning({ id: asset.id });

  if (input.caption?.words.length) {
    await upsertCaptionTrack({
      organizationId: source.organizationId,
      workspaceId: source.workspaceId,
      assetId: row.id,
      language: input.caption.language === "english" ? "en" : input.caption.language,
      words: input.caption.words,
      // Derived from the words so the two cannot drift, the rule cues.ts follows.
      text: input.caption.words.map((w) => w.text).join(" "),
      source: "generated",
      userId: input.userId,
    }).catch((err) => log.warn("caption track not written", { err, assetId: row.id }));
  }

  await db.transaction(async (tx) => {
    await emit(tx, "asset.process", { assetId: row.id }, {
      organizationId: source.organizationId,
      workspaceId: source.workspaceId,
      dedupeKey: `asset.process:${row.id}`,
    });
  });
  await db.update(asset).set({ updatedAt: new Date() }).where(eq(asset.id, row.id));
  return { assetId: row.id };
}
