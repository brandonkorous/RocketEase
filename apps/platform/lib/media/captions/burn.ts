/*
 * Burning captions into pixels.
 *
 * This is the default, not the fallback. Social video autoplays muted, and
 * almost no network accepts a caption sidecar over its API — Instagram, TikTok
 * and LinkedIn do not (docs/research/ai-media-2026.md §10). A video whose
 * captions live only in an SRT is a video most viewers watch in silence with no
 * captions at all.
 *
 * One ffmpeg pass with libass, which the media worker image ships
 * (--enable-libass --enable-libfontconfig, verified against the built image).
 */
import { writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { ffmpegPath, MediaToolError, run, toolsAvailable, FFMPEG_UNAVAILABLE } from "@/lib/media/ffmpeg";
import { withScratch } from "@/lib/media/scratch";
import { toAss, type CaptionStyle } from "./ass";
import type { Cue } from "./cues";

/** A long video is a long render. Ten minutes of wall clock, then it dies. */
export const BURN_TIMEOUT_MS = 600_000;

export type BurnInput = {
  video: Buffer;
  cues: Cue[];
  style: CaptionStyle;
  width: number;
  height: number;
  /** Container extension of the source, so ffmpeg demuxes what it was given. */
  sourceExtension: string;
};

export type BurnResult =
  | { ok: true; bytes: Buffer; mimeType: string; extension: string }
  | { ok: false; reason: string };

/**
 * Re-encodes the video (burning in is a pixel change, so it must) and COPIES the
 * audio untouched. Re-encoding audio here would quietly cost a generation of
 * quality for no reason, and it would undo a loudness pass done upstream.
 */
export async function burnCaptions(input: BurnInput): Promise<BurnResult> {
  if (!input.cues.length) return { ok: false, reason: "There are no captions to burn in." };
  const tools = await toolsAvailable();
  if (!tools.ffmpeg) return { ok: false, reason: FFMPEG_UNAVAILABLE };

  return withScratch("burn", async (dir) => {
    const source = `in${input.sourceExtension}`;
    await writeFile(join(dir, source), input.video);
    await writeFile(join(dir, "subs.ass"), toAss({ cues: input.cues, style: input.style, width: input.width, height: input.height }), "utf8");

    try {
      // Bare filenames with cwd = the scratch dir: ffmpeg's filter parser treats
      // `:` as a separator, so an absolute Windows path breaks `subtitles=`.
      await run(
        ffmpegPath(),
        [
          "-hide_banner", "-nostdin", "-y",
          "-i", source,
          "-vf", "subtitles=subs.ass",
          "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
          "-c:a", "copy",
          "-movflags", "+faststart",
          "out.mp4",
        ],
        { cwd: dir, timeoutMs: BURN_TIMEOUT_MS },
      );
    } catch (err) {
      if (err instanceof MediaToolError) {
        return { ok: false, reason: err.missing ? FFMPEG_UNAVAILABLE : `Captions could not be burned in: ${err.message}` };
      }
      throw err;
    }

    return { ok: true, bytes: await readFile(join(dir, "out.mp4")), mimeType: "video/mp4", extension: ".mp4" };
  });
}
