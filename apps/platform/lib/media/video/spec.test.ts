import { describe, expect, it } from "vitest";
import { specFor } from "@/lib/media/canvas/specs";
import type { Shot } from "@/lib/media/plan/types";
import { buildAudioGraph, dbToLinear, duckRatio, isSilent, videoNormalizeFilter } from "./audio";
import { ASSEMBLY_FPS, DEFAULT_SHOT_MS, buildAssemblySpec, durationIssues, layOutShots } from "./spec";

const shot = (over: Partial<Shot> = {}): Shot => ({
  id: "s1",
  jobKind: "broll",
  direction: "",
  references: { product: [], style: [], talent: [] },
  assetId: "a1",
  ...over,
});

/** Every source is 10s unless the test says otherwise. */
const tenSeconds = () => 10_000;
const unknown = () => null;

describe("layOutShots", () => {
  it("lays shots end to end, deriving each offset", () => {
    const out = layOutShots([shot({ id: "a", trimDurationMs: 2000 }), shot({ id: "b", trimDurationMs: 3000 })], tenSeconds);
    expect(out.map((s) => [s.offsetMs, s.durationMs])).toEqual([[0, 2000], [2000, 3000]]);
  });

  it("skips shots with nothing attached rather than leaving a gap", () => {
    const out = layOutShots([shot({ id: "a", assetId: undefined }), shot({ id: "b", trimDurationMs: 1500 })], tenSeconds);
    expect(out.map((s) => s.shotId)).toEqual(["b"]);
    expect(out[0].offsetMs).toBe(0);
  });

  it("prefers an explicit trim over a stated duration", () => {
    const out = layOutShots([shot({ trimDurationMs: 1200, durationSeconds: 8 })], tenSeconds);
    expect(out[0].durationMs).toBe(1200);
  });

  it("falls back to the stated duration when there is no trim", () => {
    expect(layOutShots([shot({ durationSeconds: 4 })], tenSeconds)[0].durationMs).toBe(4000);
  });

  it("falls back to what is LEFT in the source after the trim", () => {
    const out = layOutShots([shot({ trimStartMs: 6000 })], tenSeconds);
    expect(out[0].durationMs).toBe(4000);
  });

  it("NEVER asks for more than the source has — a freeze frame reads as a bug", () => {
    const out = layOutShots([shot({ trimStartMs: 8000, trimDurationMs: 5000 })], tenSeconds);
    expect(out[0].durationMs).toBe(2000);
  });

  it("uses the default only when the source length is genuinely unknown", () => {
    expect(layOutShots([shot()], unknown)[0].durationMs).toBe(DEFAULT_SHOT_MS);
  });

  it("drops a shot trimmed past the end of its source", () => {
    expect(layOutShots([shot({ trimStartMs: 20_000 })], tenSeconds)).toEqual([]);
  });

  it("treats a negative trim start as zero rather than seeking backwards", () => {
    expect(layOutShots([shot({ trimStartMs: -500, trimDurationMs: 1000 })], tenSeconds)[0].trimStartMs).toBe(0);
  });
});

describe("buildAssemblySpec", () => {
  it("totals the timeline and pins the canonical format", () => {
    const spec = buildAssemblySpec({
      shots: [shot({ id: "a", trimDurationMs: 2000 }), shot({ id: "b", trimDurationMs: 2500 })],
      canvasSpec: specFor("meta_reels_9x16"),
      sourceMs: tenSeconds,
    });
    expect(spec.totalMs).toBe(4500);
    expect(spec.canvas).toEqual({ width: 1080, height: 1920 });
    expect(spec.fps).toBe(ASSEMBLY_FPS);
    expect(spec.targetLufs).toBe(-14);
  });

  it("defaults the audio plan rather than leaving it undefined", () => {
    const spec = buildAssemblySpec({ shots: [shot()], canvasSpec: specFor("meta_reels_9x16"), sourceMs: tenSeconds });
    expect(spec.audio.duckDb).toBeGreaterThan(0);
  });
});

describe("durationIssues", () => {
  const reels = specFor("meta_reels_9x16");
  const build = (shots: Shot[]) => buildAssemblySpec({ shots, canvasSpec: reels, sourceMs: () => 200_000 });

  it("says plainly when there is nothing to assemble", () => {
    expect(durationIssues(build([]), reels).map((i) => i.code)).toEqual(["no_shots"]);
  });

  it("flags a cut over the placement's maximum, naming both numbers", () => {
    const issues = durationIssues(build([shot({ trimDurationMs: 95_000 })]), reels);
    const tooLong = issues.find((i) => i.code === "too_long")!;
    expect(tooLong.message).toContain("90s");
    expect(tooLong.message).toContain("95.0s");
  });

  it("flags a slow hook, because the first 3 seconds decide it", () => {
    const issues = durationIssues(build([shot({ trimDurationMs: 5000 })]), reels);
    expect(issues.map((i) => i.code)).toContain("slow_hook");
  });

  it("says nothing about the hook when the first shot is punchy", () => {
    const issues = durationIssues(build([shot({ id: "a", trimDurationMs: 2000 }), shot({ id: "b", trimDurationMs: 6000 })]), reels);
    expect(issues.map((i) => i.code)).not.toContain("slow_hook");
  });

  it("has no bounds to check on a still placement", () => {
    const feed = specFor("meta_feed_4x5");
    expect(durationIssues(build([shot({ trimDurationMs: 60_000 })]), feed).map((i) => i.code)).not.toContain("too_long");
  });
});

describe("buildAudioGraph", () => {
  const settings = { duckDb: 12, musicGainDb: -18, targetLufs: -14 };

  it("is SILENT when there is no audio at all — a fact, not an empty track", () => {
    expect(isSilent(buildAudioGraph({}, settings))).toBe(true);
  });

  it("normalises a lone voice-over without pointlessly mixing it", () => {
    const g = buildAudioGraph({ voiceover: "1:a" }, settings);
    if (isSilent(g)) throw new Error("expected audio");
    expect(g.filter).toContain("loudnorm=I=-14");
    expect(g.filter).not.toContain("amix");
  });

  it("DUCKS the bed against the voice, keyed on the voice", () => {
    const g = buildAudioGraph({ music: "2:a", voiceover: "1:a" }, settings);
    if (isSilent(g)) throw new Error("expected audio");
    expect(g.filter).toContain("sidechaincompress");
    expect(g.filter).toContain("[bed][vokey]");
  });

  it("pads the sidechain key so the compressor does not stall at the end", () => {
    const g = buildAudioGraph({ music: "2:a", voiceover: "1:a" }, settings);
    if (isSilent(g)) throw new Error("expected audio");
    expect(g.filter).toContain("apad[vokey]");
  });

  it("does not duck when there is no voice to duck against", () => {
    const g = buildAudioGraph({ music: "2:a" }, settings);
    if (isSilent(g)) throw new Error("expected audio");
    expect(g.filter).not.toContain("sidechaincompress");
    expect(g.filter).toContain("volume=");
  });

  it("attenuates the bed — a bed sits UNDER", () => {
    const g = buildAudioGraph({ music: "2:a" }, settings);
    if (isSilent(g)) throw new Error("expected audio");
    expect(g.filter).toContain(`volume=${dbToLinear(-18)}`);
  });

  it("turns amix normalisation OFF, or a mixed track comes out quieter than a lone one", () => {
    const g = buildAudioGraph({ body: "0:a", voiceover: "1:a" }, settings);
    if (isSilent(g)) throw new Error("expected audio");
    expect(g.filter).toContain("normalize=0");
    expect(g.filter).toContain("duration=longest");
  });

  it("always ends on the label it says it does", () => {
    const g = buildAudioGraph({ body: "0:a", music: "2:a", voiceover: "1:a" }, settings);
    if (isSilent(g)) throw new Error("expected audio");
    expect(g.outLabel).toBe("aout");
    expect(g.filter.endsWith("[aout]")).toBe(true);
  });
});

describe("gain maths", () => {
  it("converts dB to linear the way the volume filter expects", () => {
    expect(dbToLinear(0)).toBe(1);
    expect(dbToLinear(-6)).toBeCloseTo(0.501, 3);
    expect(dbToLinear(-18)).toBeCloseTo(0.126, 3);
  });

  it("keeps the duck ratio inside a sane band whatever the plan asks for", () => {
    expect(duckRatio(0)).toBe(1.5);
    expect(duckRatio(12)).toBe(7);
    expect(duckRatio(400)).toBe(20);
  });
});

describe("videoNormalizeFilter", () => {
  it("fills the canvas without distorting, then pins fps, SAR and pixel format", () => {
    const f = videoNormalizeFilter(1080, 1920, 30);
    expect(f).toBe("scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setsar=1,format=yuv420p");
  });
});
