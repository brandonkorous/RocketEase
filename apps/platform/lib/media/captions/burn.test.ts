/*
 * Real ffmpeg, real libass, real pixels.
 *
 * ffmpeg exiting 0 proves nothing here: `subtitles=` renders silently-nothing if
 * the ASS is malformed or no font resolves, and the file still muxes fine. So
 * these tests compare a frame DURING a cue against a frame in the gap and assert
 * the caption band actually changed. That is the only assertion that would have
 * caught a burn-in shipping blank.
 *
 * Small on purpose (270×480, 3s) so it stays a fast test rather than a render.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { specFor } from "@/lib/media/canvas/specs";
import { ffmpegPath, run, toolsAvailable } from "@/lib/media/ffmpeg";
import { withScratch } from "@/lib/media/scratch";
import { styleForPlacement } from "./ass";
import { burnCaptions } from "./burn";
import type { Cue } from "./cues";

// Module scope: `it.skipIf` is evaluated during collection, before any hook runs.
const tools = await toolsAvailable();

const W = 270;
const H = 480;
const spec = { ...specFor("meta_reels_9x16"), width: W, height: H };
const style = styleForPlacement(spec);

const blackVideo = () =>
  withScratch("burn-test", async (dir) => {
    await run(
      ffmpegPath(),
      ["-hide_banner", "-nostdin", "-y", "-f", "lavfi", "-i", `color=c=black:s=${W}x${H}:d=3`, "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "src.mp4"],
      { cwd: dir, timeoutMs: 60_000 },
    );
    return readFile(join(dir, "src.mp4"));
  });

/** Brightest pixel at a timestamp, over the whole frame or just the caption band. */
async function maxLumaAt(video: Buffer, seconds: string, band = false): Promise<number> {
  return withScratch("frame", async (dir) => {
    await writeFile(join(dir, "v.mp4"), video);
    await run(ffmpegPath(), ["-hide_banner", "-nostdin", "-y", "-ss", seconds, "-i", "v.mp4", "-frames:v", "1", "f.png"], { cwd: dir, timeoutMs: 60_000 });
    const png = await readFile(join(dir, "f.png"));
    if (!band) return (await sharp(png).stats()).channels[0].max;
    const top = Math.max(0, H - style.marginBottomPx - style.fontSizePx * 3);
    const height = Math.min(style.fontSizePx * 3, H - top);
    return (await sharp(png).extract({ left: 0, top, width: W, height }).stats()).channels[0].max;
  });
}

const CUES: Cue[] = [{ startMs: 0, endMs: 1000, lines: ["CAPTION VISIBLE", "SECOND LINE"] }];

describe.skipIf(!tools.ffmpeg)("burnCaptions", () => {
  it("puts the caption INTO THE PIXELS, not just into the container", async () => {
    const burned = await burnCaptions({ video: await blackVideo(), cues: CUES, style, width: W, height: H, sourceExtension: ".mp4" });
    expect(burned.ok).toBe(true);
    if (!burned.ok) return;
    // The source is pure black, so any bright pixel is drawn text.
    expect(await maxLumaAt(burned.bytes, "0.4")).toBeGreaterThan(200);
  }, 120_000);

  it("shows nothing once the cue has ended — timings are honoured", async () => {
    const burned = await burnCaptions({ video: await blackVideo(), cues: CUES, style, width: W, height: H, sourceExtension: ".mp4" });
    if (!burned.ok) throw new Error(burned.reason);
    expect(await maxLumaAt(burned.bytes, "2.5")).toBe(0);
  }, 120_000);

  it("draws inside the SAFE BAND, clear of the Reels chrome", async () => {
    const burned = await burnCaptions({ video: await blackVideo(), cues: CUES, style, width: W, height: H, sourceExtension: ".mp4" });
    if (!burned.ok) throw new Error(burned.reason);
    expect(await maxLumaAt(burned.bytes, "0.4", true)).toBeGreaterThan(200);
  }, 120_000);

  it("keeps the video's dimensions and duration", async () => {
    const burned = await burnCaptions({ video: await blackVideo(), cues: CUES, style, width: W, height: H, sourceExtension: ".mp4" });
    if (!burned.ok) throw new Error(burned.reason);
    const { probeBuffer } = await import("@/lib/media/probe");
    const { probe } = await probeBuffer(burned.bytes, "out.mp4");
    expect([probe.width, probe.height]).toEqual([W, H]);
    expect(probe.durationSeconds).toBeGreaterThan(2.5);
  }, 120_000);
});

describe("burnCaptions refusals", () => {
  it("refuses an empty caption track rather than re-encoding for nothing", async () => {
    const result = await burnCaptions({ video: Buffer.alloc(0), cues: [], style, width: W, height: H, sourceExtension: ".mp4" });
    expect(result).toEqual({ ok: false, reason: "There are no captions to burn in." });
  });

  it("reports a reason rather than throwing when the video cannot be decoded", async () => {
    const result = await burnCaptions({ video: Buffer.from("not a video"), cues: CUES, style, width: W, height: H, sourceExtension: ".mp4" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason.length).toBeGreaterThan(10);
  }, 60_000);
});
