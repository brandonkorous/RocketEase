/*
 * Probing real bytes, and extracting a poster frame.
 *
 * The rule that matters: we PROBE rather than believe. A vendor's stated
 * duration is a claim; the file is the fact. This is also what finally makes
 * `Capabilities.limits.videoMaxSeconds` enforceable — until now it was checked
 * against a duration nothing ever learned.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { log } from "@/lib/log";
import { FFPROBE_UNAVAILABLE, MediaToolError, ffmpegPath, ffprobePath, run, toolsAvailable } from "./ffmpeg";
import { EMPTY_PROBE, parseProbe, type Probe } from "./probe-parse";

export type { Probe } from "./probe-parse";
export { mismatches, wholeSeconds } from "./probe-parse";

/** Probed facts, or an honest reason we have none. `unavailable` is not failure. */
export type ProbeResult = { probe: Probe; unavailableReason: string | null };

export const UNPROBED: ProbeResult = { probe: EMPTY_PROBE, unavailableReason: FFPROBE_UNAVAILABLE };

const ARGS = ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams"];

/** Scratch directory. MEDIA_SCRATCH_DIR points at the worker's mounted volume. */
async function scratch(): Promise<string> {
  const base = process.env.MEDIA_SCRATCH_DIR || tmpdir();
  return mkdtemp(join(base, "rke-media-"));
}

/** Probe bytes on disk — ffprobe needs a seekable file for most containers. */
export async function probeBuffer(bytes: Buffer, fileName = "input"): Promise<ProbeResult> {
  const tools = await toolsAvailable();
  if (!tools.ffprobe) return UNPROBED;

  const dir = await scratch();
  const path = join(dir, fileName.replace(/[^\w.-]/g, "_") || "input");
  try {
    await writeFile(path, bytes);
    const { stdout } = await run(ffprobePath(), [...ARGS, path], { timeoutMs: 60_000 });
    return { probe: parseProbe(stdout.toString("utf8")), unavailableReason: null };
  } catch (err) {
    if (err instanceof MediaToolError && err.missing) return UNPROBED;
    // A file ffprobe cannot read is unknown, not zero. The asset still stores.
    log.warn("probe failed", { err: err instanceof Error ? err.message : String(err) });
    return { probe: EMPTY_PROBE, unavailableReason: "This file couldn't be inspected, so its duration and dimensions are unknown." };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * A frame for the poster rendition. 10% in avoids the black first frame most
 * encoders start with; it is a reasonable default, not a good one — revisit
 * when hooks matter (12.4).
 */
export const POSTER_AT_FRACTION = 0.1;

export async function posterFrame(bytes: Buffer, durationSeconds: number | null, fileName = "input"): Promise<Buffer | null> {
  const tools = await toolsAvailable();
  if (!tools.ffmpeg) return null;

  const at = durationSeconds && durationSeconds > 0 ? Math.min(durationSeconds * POSTER_AT_FRACTION, Math.max(durationSeconds - 0.1, 0)) : 0;
  const dir = await scratch();
  const input = join(dir, fileName.replace(/[^\w.-]/g, "_") || "input");
  const output = join(dir, "poster.png");
  try {
    await writeFile(input, bytes);
    // -ss before -i seeks by keyframe: fast, and accurate enough for a poster.
    await run(ffmpegPath(), ["-v", "error", "-ss", at.toFixed(3), "-i", input, "-frames:v", "1", "-y", output], { timeoutMs: 60_000 });
    const { readFile } = await import("node:fs/promises");
    return await readFile(output);
  } catch (err) {
    log.warn("poster frame failed", { err: err instanceof Error ? err.message : String(err) });
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
