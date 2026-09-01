/*
 * Real ffmpeg. The assertions that matter are about the OUTPUT, not the exit
 * code: a mixed-format concat produces a file that plays for two seconds and
 * then stops, with no error anywhere, so "it encoded" proves nothing.
 *
 * Small and short (180×320, ~2s total) to stay a test rather than a render.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { ffmpegPath, run, toolsAvailable } from "@/lib/media/ffmpeg";
import { probeBuffer } from "@/lib/media/probe";
import { withScratch } from "@/lib/media/scratch";
import { assembleVideo, type ClipBytes } from "./assemble";
import { ASSEMBLY_FPS, TARGET_LUFS, type AssemblySpec } from "./spec";

const tools = await toolsAvailable();

const W = 180;
const H = 320;

/** A clip of a solid colour, at a size and frame rate DELIBERATELY unlike the canvas. */
async function clip(colour: string, seconds: number, size: string, fps: number, withAudio: boolean): Promise<ClipBytes> {
  const bytes = await withScratch("clip", async (dir) => {
    const args = ["-hide_banner", "-nostdin", "-y", "-f", "lavfi", "-i", `color=c=${colour}:s=${size}:d=${seconds}:r=${fps}`];
    if (withAudio) args.push("-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`, "-c:a", "aac", "-ar", "44100");
    args.push("-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-shortest", "c.mp4");
    await run(ffmpegPath(), args, { cwd: dir, timeoutMs: 60_000 });
    return readFile(join(dir, "c.mp4"));
  });
  return { bytes, extension: ".mp4" };
}

const spec = (shots: { assetId: string; durationMs: number; trimStartMs?: number }[]): AssemblySpec => ({
  canvas: { width: W, height: H },
  fps: ASSEMBLY_FPS,
  shots: shots.map((s, i) => ({
    shotId: `s${i}`,
    assetId: s.assetId,
    trimStartMs: s.trimStartMs ?? 0,
    durationMs: s.durationMs,
    offsetMs: shots.slice(0, i).reduce((sum, p) => sum + p.durationMs, 0),
  })),
  totalMs: shots.reduce((sum, s) => sum + s.durationMs, 0),
  audio: { duckDb: 12, musicGainDb: -18 },
  targetLufs: TARGET_LUFS,
});

/** The mean colour of a frame at a timestamp, to prove which shot is playing. */
async function frameRgbAt(video: Buffer, seconds: string): Promise<[number, number, number]> {
  return withScratch("frame", async (dir) => {
    await writeFile(join(dir, "v.mp4"), video);
    await run(ffmpegPath(), ["-hide_banner", "-nostdin", "-y", "-ss", seconds, "-i", "v.mp4", "-frames:v", "1", "f.png"], { cwd: dir, timeoutMs: 60_000 });
    const s = await sharp(await readFile(join(dir, "f.png"))).stats();
    return [s.channels[0].mean, s.channels[1].mean, s.channels[2].mean] as [number, number, number];
  });
}

describe.skipIf(!tools.ffmpeg)("assembleVideo", () => {
  it("joins clips of DIFFERENT sizes and frame rates into one playable file", async () => {
    const red = await clip("red", 2, "320x180", 25, true);
    const blue = await clip("blue", 2, "480x854", 24, true);

    const result = await assembleVideo({
      spec: spec([{ assetId: "r", durationMs: 1000 }, { assetId: "b", durationMs: 1000 }]),
      clips: { r: red, b: blue },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { probe } = await probeBuffer(result.bytes, "out.mp4");
    // The whole point: BOTH shots survived. A bad concat stops after the first.
    expect(probe.durationSeconds).toBeGreaterThan(1.7);
    expect([probe.width, probe.height]).toEqual([W, H]);
  }, 180_000);

  it("plays the shots IN ORDER — the first clip first", async () => {
    const red = await clip("red", 2, "320x180", 25, false);
    const blue = await clip("blue", 2, "480x854", 24, false);
    const result = await assembleVideo({
      spec: spec([{ assetId: "r", durationMs: 1000 }, { assetId: "b", durationMs: 1000 }]),
      clips: { r: red, b: blue },
    });
    if (!result.ok) throw new Error(result.reason);

    const [r1, g1, b1] = await frameRgbAt(result.bytes, "0.4");
    const [r2, g2, b2] = await frameRgbAt(result.bytes, "1.5");
    expect(r1).toBeGreaterThan(b1);
    expect(b2).toBeGreaterThan(r2);
    expect(g1 + g2).toBeLessThan(120);
  }, 180_000);

  it("joins a SILENT clip to one with audio — concat refuses mismatched streams", async () => {
    const silent = await clip("green", 2, "320x180", 25, false);
    const loud = await clip("white", 2, "320x180", 25, true);
    const result = await assembleVideo({
      spec: spec([{ assetId: "s", durationMs: 1000 }, { assetId: "l", durationMs: 1000 }]),
      clips: { s: silent, l: loud },
    });
    if (!result.ok) throw new Error(result.reason);
    const { probe } = await probeBuffer(result.bytes, "out.mp4");
    expect(probe.durationSeconds).toBeGreaterThan(1.7);
    expect(probe.hasAudio).toBe(true);
  }, 180_000);

  it("honours a trim, taking the requested slice rather than the whole clip", async () => {
    const red = await clip("red", 4, "320x180", 25, false);
    const result = await assembleVideo({
      spec: spec([{ assetId: "r", durationMs: 800, trimStartMs: 2000 }]),
      clips: { r: red },
    });
    if (!result.ok) throw new Error(result.reason);
    const { probe } = await probeBuffer(result.bytes, "out.mp4");
    expect(probe.durationSeconds).toBeLessThan(1.2);
  }, 180_000);

  it("composites the type overlay onto the moving picture", async () => {
    const black = await clip("black", 2, "180x320", 25, false);
    const overlay = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: await sharp({ create: { width: 100, height: 40, channels: 4, background: "#ffffff" } }).png().toBuffer(), top: 100, left: 40 }])
      .png()
      .toBuffer();

    const result = await assembleVideo({ spec: spec([{ assetId: "k", durationMs: 1000 }]), clips: { k: black }, overlay });
    if (!result.ok) throw new Error(result.reason);
    // Black footage plus a white patch: any bright pixel is the overlay.
    const [r] = await frameRgbAt(result.bytes, "0.4");
    expect(r).toBeGreaterThan(5);
  }, 180_000);

  it("lets the PICTURE decide the length — a longer voice-over does not extend the file", async () => {
    const short = await clip("red", 2, "180x320", 25, false);
    // 4s of audio over a 1s cut. Without -shortest the container runs to 4s and
    // every player shows a dead tail.
    const voice = await clip("black", 4, "16x16", 25, true);
    const result = await assembleVideo({
      spec: spec([{ assetId: "r", durationMs: 1000 }]),
      clips: { r: short },
      voiceover: voice,
    });
    if (!result.ok) throw new Error(result.reason);
    const { probe } = await probeBuffer(result.bytes, "out.mp4");
    expect(probe.durationSeconds).toBeLessThan(1.5);
    expect(probe.hasAudio).toBe(true);
  }, 180_000);

  it("reports a missing clip and still assembles what it has", async () => {
    const red = await clip("red", 2, "320x180", 25, false);
    const result = await assembleVideo({
      spec: spec([{ assetId: "r", durationMs: 800 }, { assetId: "gone", durationMs: 800 }]),
      clips: { r: red },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.notes.join(" ")).toContain("could not be read");
  }, 180_000);
});

describe("assembleVideo refusals", () => {
  it("refuses an empty timeline rather than encoding nothing", async () => {
    expect(await assembleVideo({ spec: spec([]), clips: {} })).toEqual({ ok: false, reason: "There are no clips to assemble." });
  });

  it("refuses when not one clip could be read", async () => {
    const result = await assembleVideo({ spec: spec([{ assetId: "gone", durationMs: 500 }]), clips: {} });
    expect(result).toEqual({ ok: false, reason: "None of this plan's clips could be read." });
  });
});
