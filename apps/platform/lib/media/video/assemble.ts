/*
 * Assembly: shots → one file per placement.
 *
 * Two passes on purpose. Every shot is first normalised to the SAME canvas, fps,
 * pixel format and audio layout, because the concat demuxer requires identical
 * streams — a mixed-format concat produces a file that plays for two seconds and
 * then stops, with no error anywhere. Then one final pass overlays the
 * composited type, burns the captions and mixes the audio.
 *
 * It costs disk. That is what the media worker's scratch volume is for.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { FFMPEG_UNAVAILABLE, MediaToolError, ffmpegPath, run, toolsAvailable } from "@/lib/media/ffmpeg";
import { probeBuffer } from "@/lib/media/probe";
import { withScratch } from "@/lib/media/scratch";
import { buildAudioGraph, isSilent, videoNormalizeFilter } from "./audio";
import type { AssemblySpec } from "./spec";

/** A long assembly is a long render. Fifteen minutes, then it dies. */
export const ASSEMBLE_TIMEOUT_MS = 900_000;
const SEGMENT_TIMEOUT_MS = 300_000;

export type ClipBytes = { bytes: Buffer; extension: string };

export type AssembleInput = {
  spec: AssemblySpec;
  /** One entry per asset id the spec names. A missing one is reported, not fatal. */
  clips: Record<string, ClipBytes>;
  voiceover?: ClipBytes;
  music?: ClipBytes;
  /** Full-canvas PNG with alpha: composited type and logo from the brand kit. */
  overlay?: Buffer;
  /** ASS subtitles to burn in. */
  ass?: string;
};

export type AssembleResult =
  | { ok: true; bytes: Buffer; mimeType: string; extension: string; notes: string[] }
  | { ok: false; reason: string };

const ms = (v: number) => (v / 1000).toFixed(3);

/**
 * Normalise one shot into a segment. Silent sources get real silence rather than
 * no audio stream at all — the concat demuxer will not join a file that has an
 * audio track to one that does not.
 */
async function writeSegment(dir: string, index: number, clip: ClipBytes, shot: AssemblySpec["shots"][number], spec: AssemblySpec) {
  const source = `src${index}${clip.extension}`;
  await writeFile(join(dir, source), clip.bytes);
  const { probe } = await probeBuffer(clip.bytes, source);

  const args = ["-hide_banner", "-nostdin", "-y", "-ss", ms(shot.trimStartMs), "-t", ms(shot.durationMs), "-i", source];
  if (!probe.hasAudio) args.push("-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo");

  args.push(
    "-map", "0:v:0",
    "-map", probe.hasAudio ? "0:a:0" : "1:a:0",
    "-vf", videoNormalizeFilter(spec.canvas.width, spec.canvas.height, spec.fps),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
    "-c:a", "aac", "-ar", "48000", "-ac", "2", "-b:a", "192k",
    "-t", ms(shot.durationMs),
    `seg${index}.mp4`,
  );
  await run(ffmpegPath(), args, { cwd: dir, timeoutMs: SEGMENT_TIMEOUT_MS });
  return { file: `seg${index}.mp4`, hadAudio: probe.hasAudio };
}

/** Concat demuxer with `-c copy`: legal only because every segment is identical. */
async function concat(dir: string, files: string[]) {
  await writeFile(join(dir, "list.txt"), files.map((f) => `file '${f}'`).join("\n"), "utf8");
  await run(ffmpegPath(), ["-hide_banner", "-nostdin", "-y", "-f", "concat", "-safe", "0", "-i", "list.txt", "-c", "copy", "body.mp4"], {
    cwd: dir,
    timeoutMs: SEGMENT_TIMEOUT_MS,
  });
}

type FinalPass = { args: string[]; notes: string[] };

/** Build the last pass: overlay, captions, audio mix. Input order decides labels. */
function finalPassArgs(input: AssembleInput, hasBodyAudio: boolean): FinalPass {
  const notes: string[] = [];
  const args = ["-hide_banner", "-nostdin", "-y", "-i", "body.mp4"];
  let next = 1;

  const overlayIndex = input.overlay ? next++ : null;
  if (overlayIndex !== null) args.push("-i", "overlay.png");
  const voIndex = input.voiceover ? next++ : null;
  if (voIndex !== null) args.push("-i", `vo${input.voiceover!.extension}`);
  const musicIndex = input.music ? next++ : null;
  if (musicIndex !== null) args.push("-i", `music${input.music!.extension}`);

  const chains: string[] = [];
  let videoLabel = "0:v";
  if (overlayIndex !== null) {
    chains.push(`[${videoLabel}][${overlayIndex}:v]overlay=0:0[ov]`);
    videoLabel = "ov";
  }
  if (input.ass) {
    chains.push(`[${videoLabel}]subtitles=subs.ass[vout]`);
    videoLabel = "vout";
  }

  const audio = buildAudioGraph(
    { body: hasBodyAudio ? "0:a" : undefined, voiceover: voIndex === null ? undefined : `${voIndex}:a`, music: musicIndex === null ? undefined : `${musicIndex}:a` },
    { duckDb: input.spec.audio.duckDb, musicGainDb: input.spec.audio.musicGainDb, targetLufs: input.spec.targetLufs },
  );
  if (!isSilent(audio)) chains.push(audio.filter);
  else notes.push("This cut has no audio at all — no shot carried sound and no voice-over or music was added.");

  if (chains.length) args.push("-filter_complex", chains.join(";"));
  args.push("-map", chains.length && videoLabel !== "0:v" ? `[${videoLabel}]` : "0:v");
  if (!isSilent(audio)) args.push("-map", `[${audio.outLabel}]`);

  args.push(
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-ar", "48000", "-ac", "2", "-b:a", "192k",
    "-movflags", "+faststart",
    // The PICTURE decides the length. `amix=duration=longest` will happily run
    // the audio past the last frame, which produces a container longer than the
    // video and a dead tail on every player. Whether that audio was speech is
    // the caller's business to report — see assembly-job.ts.
    "-shortest",
    "out.mp4",
  );
  return { args, notes };
}

export async function assembleVideo(input: AssembleInput): Promise<AssembleResult> {
  if (!input.spec.shots.length) return { ok: false, reason: "There are no clips to assemble." };
  if (!(await toolsAvailable()).ffmpeg) return { ok: false, reason: FFMPEG_UNAVAILABLE };

  return withScratch("assemble", async (dir) => {
    const notes: string[] = [];
    const files: string[] = [];
    let hasBodyAudio = false;

    try {
      for (const [i, shot] of input.spec.shots.entries()) {
        const clip = input.clips[shot.assetId];
        if (!clip) {
          notes.push(`A clip in this plan could not be read, so ${shot.durationMs}ms was left out of the cut.`);
          continue;
        }
        const segment = await writeSegment(dir, i, clip, shot, input.spec);
        files.push(segment.file);
        hasBodyAudio = hasBodyAudio || segment.hadAudio;
      }
      if (!files.length) return { ok: false, reason: "None of this plan's clips could be read." };

      await concat(dir, files);
      if (input.overlay) await writeFile(join(dir, "overlay.png"), input.overlay);
      if (input.ass) await writeFile(join(dir, "subs.ass"), input.ass, "utf8");
      if (input.voiceover) await writeFile(join(dir, `vo${input.voiceover.extension}`), input.voiceover.bytes);
      if (input.music) await writeFile(join(dir, `music${input.music.extension}`), input.music.bytes);

      const pass = finalPassArgs(input, hasBodyAudio);
      await run(ffmpegPath(), pass.args, { cwd: dir, timeoutMs: ASSEMBLE_TIMEOUT_MS });

      return { ok: true, bytes: await readFile(join(dir, "out.mp4")), mimeType: "video/mp4", extension: ".mp4", notes: [...notes, ...pass.notes] };
    } catch (err) {
      if (err instanceof MediaToolError) {
        return { ok: false, reason: err.missing ? FFMPEG_UNAVAILABLE : `The video could not be assembled: ${err.message}` };
      }
      throw err;
    }
  });
}
