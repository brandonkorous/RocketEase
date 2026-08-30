/*
 * Audio processing: duration only for now.
 *
 * The waveform rendition lands with the voice-over work (12.3), where there is
 * a player to draw it under. Recording an unknown duration honestly matters
 * more than a picture of a wave.
 */
import type { asset } from "@/db/schema/assets";
import { probeBuffer, wholeSeconds } from "@/lib/media/probe";
import type { MediaOutcome } from "./video";
import type { AssetRef } from "./image";

type Patch = Partial<typeof asset.$inferInsert>;

export async function processAudio(_row: AssetRef, buf: Buffer, fileName: string): Promise<MediaOutcome> {
  const { probe, unavailableReason } = await probeBuffer(buf, fileName);
  const patch: Patch = { durationSeconds: wholeSeconds(probe.durationSeconds) };
  return { patch, note: unavailableReason };
}
