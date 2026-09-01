/*
 * Adding a voice-over — and captions of it — to a clip that already exists.
 *
 * Runs on the media worker, because it is ffmpeg work. Two assets come out of
 * it and that is deliberate:
 *
 *   the voice-over mp3   its own generation, its own cost, its own disclosure
 *   the finished clip    derived from the source, inheriting its rights
 *
 * The voice goes through createMediaJob like every other generation, so it is
 * metered, capped and credited rather than being a quiet side-effect of asking
 * for a video. Nothing here calls a vendor directly.
 *
 * Captions are burned BEFORE the file is stored, so one job produces one
 * finished clip rather than a chain of half-finished ones. The words are still
 * written to a caption_track, because they are the source of truth and a person
 * has to be able to fix a misheard one and re-burn.
 */
import { buildRegistry } from "@rocketease/media";
import { asset } from "@/db/schema/assets";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { log } from "@/lib/log";
import { getObjectBuffer } from "@/lib/storage";
import { runMediaJobNow } from "../run-now";
import { probeBuffer } from "../probe";
import { muxVoiceover } from "./mux";
import { captionsFor } from "./captions";
import { storeDerived } from "./store-derived";

export type VoiceoverJobInput = {
  assetId: string;
  workspaceId: string;
  organizationId: string;
  /** Required: a voice-over is always something a person asked for, and the
   * ledger row it creates has a real foreign key to fill. */
  userId: string;
  script: string;
  voiceId?: string;
  captions: boolean;
};

export type VoiceoverJobResult = { assetId: string; truncatedVoiceBy: number | null; captionCues: number } | { error: string };

export async function runVoiceoverJob(input: VoiceoverJobInput): Promise<VoiceoverJobResult> {
  const [source] = await db.select().from(asset).where(eq(asset.id, input.assetId));
  if (!source || source.workspaceId !== input.workspaceId || source.deletedAt) return { error: "That clip is no longer in the library." };
  if (source.kind !== "video") return { error: "A voice-over can only go on a video." };

  // Metered like any other generation — never a free side-effect of a video.
  const spoken = await runMediaJobNow({
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    userId: input.userId,
    spec: { jobKind: "voiceover", prompt: input.script, ...(input.voiceId ? { voiceId: input.voiceId } : {}) },
  });
  if ("error" in spoken) return { error: spoken.error };
  if ("pending" in spoken) return { error: "The voice model queued the job; voice-over expects an immediate answer." };

  const [voiceAsset] = await db.select().from(asset).where(eq(asset.id, spoken.assetIds[0]));
  if (!voiceAsset) return { error: "The voice-over was generated but could not be read back." };

  const [videoBytes, voiceBytes] = await Promise.all([getObjectBuffer(source.storageKey), getObjectBuffer(voiceAsset.storageKey)]);
  const voiceProbe = await probeBuffer(voiceBytes, voiceAsset.fileName);

  // Timings come from the voice we just made, not the finished mix: cleaner
  // audio, and the words are the ones we wrote rather than ones misheard
  // through a lake.
  const caption = input.captions
    ? await captionsFor({ bytes: voiceBytes, mimeType: voiceAsset.mimeType, source, registry: buildRegistry(), workspaceId: input.workspaceId })
    : null;

  const muxed = await muxVoiceover({
    video: videoBytes,
    voice: voiceBytes,
    videoSeconds: source.durationSeconds,
    voiceSeconds: voiceProbe.probe.durationSeconds,
  });
  if (!muxed.ok) return { error: muxed.reason };

  const stored = await storeDerived({
    source,
    bytes: muxed.bytes,
    caption,
    userId: input.userId,
    modelKey: voiceAsset.generationModel ?? null,
  });
  if ("error" in stored) return stored;

  if (muxed.truncatedVoiceBy) {
    log.warn("voice-over was cut off by the picture", { assetId: stored.assetId, seconds: muxed.truncatedVoiceBy });
  }
  return { assetId: stored.assetId, truncatedVoiceBy: muxed.truncatedVoiceBy, captionCues: caption?.cues.length ?? 0 };
}
