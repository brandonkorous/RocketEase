/*
 * Integration: the real ffprobe path against real files.
 *
 * Skipped when ffmpeg isn't installed, so CI without it stays green — but when
 * it IS there, this is the test that proves a video upload finally learns its
 * own duration.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ffmpegPath, run, toolsAvailable } from "./ffmpeg";
import { UNPROBED, posterFrame, probeBuffer } from "./probe";

/*
 * Resolved at module scope, not in beforeAll: `it.skip` is decided when the
 * describe body RUNS (collection time), which is before any hook has fired.
 */
const tools = await toolsAvailable();
let dir = "";
let video: Buffer;
let audio: Buffer;

beforeAll(async () => {
  if (!tools.ffmpeg) return;
  dir = await mkdtemp(join(tmpdir(), "rke-probe-test-"));
  const mp4 = join(dir, "v.mp4");
  const mp3 = join(dir, "a.mp3");
  // 3s of colour bars at 640x360, 25fps, with a tone — a real file, not a stub.
  await run(ffmpegPath(), [
    "-v", "error", "-f", "lavfi", "-i", "testsrc=size=640x360:rate=25:duration=3",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", "-y", mp4,
  ], { timeoutMs: 60_000 });
  await run(ffmpegPath(), ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-y", mp3], { timeoutMs: 60_000 });
  video = await readFile(mp4);
  audio = await readFile(mp3);
}, 90_000);

afterAll(async () => {
  if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
});

const withTools = () => (tools.ffprobe ? it : it.skip);

describe("probeBuffer", () => {
  withTools()("learns a video's real duration and dimensions", async () => {
    const { probe, unavailableReason } = await probeBuffer(video, "v.mp4");
    expect(unavailableReason).toBeNull();
    expect(probe.durationSeconds).toBeGreaterThan(2.8);
    expect(probe.durationSeconds).toBeLessThan(3.3);
    expect(probe.width).toBe(640);
    expect(probe.height).toBe(360);
    expect(probe.hasVideo).toBe(true);
    expect(probe.hasAudio).toBe(true);
    expect(probe.fps).toBeCloseTo(25, 1);
  }, 30_000);

  withTools()("learns an audio file's duration and reports no video stream", async () => {
    const { probe } = await probeBuffer(audio, "a.mp3");
    expect(probe.durationSeconds).toBeGreaterThan(1.8);
    expect(probe.hasVideo).toBe(false);
    expect(probe.hasAudio).toBe(true);
    expect(probe.width).toBeNull();
  }, 30_000);

  withTools()("reports garbage as unknown rather than zero", async () => {
    const { probe, unavailableReason } = await probeBuffer(Buffer.from("not a media file"), "junk.mp4");
    expect(probe.durationSeconds).toBeNull();
    expect(unavailableReason).toBeTruthy();
  }, 30_000);
});

describe("posterFrame", () => {
  withTools()("extracts a real PNG frame", async () => {
    const poster = await posterFrame(video, 3, "v.mp4");
    expect(poster).not.toBeNull();
    // PNG magic — proves it is an image, not an empty buffer.
    expect(poster!.subarray(0, 4).toString("hex")).toBe("89504e47");
    expect(poster!.byteLength).toBeGreaterThan(1000);
  }, 30_000);

  withTools()("still produces a frame when the duration is unknown", async () => {
    expect(await posterFrame(video, null, "v.mp4")).not.toBeNull();
  }, 30_000);
});

describe("when the tools are missing", () => {
  it("has an UNPROBED result that is unknown, not zero", () => {
    expect(UNPROBED.probe.durationSeconds).toBeNull();
    expect(UNPROBED.unavailableReason).toBeTruthy();
  });
});
