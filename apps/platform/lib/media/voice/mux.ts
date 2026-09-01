/*
 * Laying a voice-over over a generated clip.
 *
 * Two things happen here that are not optional:
 *
 * 1. The clip's own ambience is DUCKED rather than discarded. Sora returns a
 *    bed with the picture, and throwing it away makes a lake look silent.
 * 2. The output is resampled to 48 kHz. Sora hands back 96 kHz, which is
 *    outside every network's delivery spec — Meta's is 48 — and is the kind of
 *    thing that survives our tests and gets re-encoded by somebody else later.
 *
 * The PICTURE decides the length. A voice-over longer than the clip is cut off,
 * and that is REPORTED rather than silently accepted: a half-finished sentence
 * is worse than a shorter clip, and only a person can decide which to fix.
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_TIMEOUT_MS, ffmpegPath, run } from "../ffmpeg";
import { buildAudioGraph, isSilent } from "../video/audio";

/** Networks deliver 48 kHz. Nothing here should ever emit anything else. */
export const DELIVERY_SAMPLE_RATE = 48_000;
export const DELIVERY_AUDIO_BITRATE = "128k";

/** Bed under a voice, and how hard the voice pushes it down. Both in dB. */
export const BED_GAIN_DB = -8;
export const DUCK_DB = -12;
export const TARGET_LUFS = -14;

export type MuxInput = {
  video: Buffer;
  voice: Buffer;
  /** Probed lengths, for the honest "the voice was cut off" report. */
  videoSeconds: number | null;
  voiceSeconds: number | null;
};

export type MuxResult =
  | { ok: true; bytes: Buffer; truncatedVoiceBy: number | null }
  | { ok: false; reason: string };

/** Seconds of voice that will not fit, or null when it fits (or is unknown). */
export function voiceOverrun(videoSeconds: number | null, voiceSeconds: number | null): number | null {
  if (videoSeconds === null || voiceSeconds === null) return null;
  const over = voiceSeconds - videoSeconds;
  // Under a fifth of a second is an encoder rounding artefact, not a lost word.
  return over > 0.2 ? Number(over.toFixed(2)) : null;
}

export async function muxVoiceover(input: MuxInput): Promise<MuxResult> {
  const graph = buildAudioGraph(
    // The clip's ambience is the BED: it is what gets pushed down under a voice.
    { music: "0:a", voiceover: "1:a" },
    { duckDb: DUCK_DB, musicGainDb: BED_GAIN_DB, targetLufs: TARGET_LUFS },
  );
  if (isSilent(graph)) return { ok: false, reason: "There was no audio to mix." };

  const dir = await mkdtemp(join(process.env.MEDIA_SCRATCH_DIR || tmpdir(), "rke-vo-"));
  try {
    const vPath = join(dir, "in.mp4");
    const aPath = join(dir, "voice.mp3");
    const outPath = join(dir, "out.mp4");
    await writeFile(vPath, input.video);
    await writeFile(aPath, input.voice);

    await run(
      ffmpegPath(),
      [
        "-v", "error", "-y",
        "-i", vPath,
        "-i", aPath,
        "-filter_complex", graph.filter,
        "-map", "0:v",
        "-map", `[${graph.outLabel}]`,
        // The picture is untouched: copying keeps the generation we paid for.
        "-c:v", "copy",
        "-c:a", "aac", "-ar", String(DELIVERY_SAMPLE_RATE), "-ac", "2", "-b:a", DELIVERY_AUDIO_BITRATE,
        "-shortest",
        "-movflags", "+faststart",
        outPath,
      ],
      { timeoutMs: DEFAULT_TIMEOUT_MS },
    );

    return {
      ok: true as const,
      bytes: await readFile(outPath),
      truncatedVoiceBy: voiceOverrun(input.videoSeconds, input.voiceSeconds),
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
