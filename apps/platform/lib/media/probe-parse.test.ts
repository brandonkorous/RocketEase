import { describe, expect, it } from "vitest";
import { EMPTY_PROBE, mismatches, num, parseFrameRate, parseProbe, wholeSeconds } from "./probe-parse";

const probeJson = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    format: { duration: "8.033", bit_rate: "1200000" },
    streams: [
      { codec_type: "video", codec_name: "h264", width: 1280, height: 720, avg_frame_rate: "30000/1001" },
      { codec_type: "audio", codec_name: "aac" },
    ],
    ...over,
  });

describe("num", () => {
  it("reads ffprobe's stringly numbers", () => {
    expect(num("8.033")).toBe(8.033);
    expect(num(720)).toBe(720);
  });

  it("returns null rather than 0 for anything unreadable", () => {
    for (const v of [undefined, null, "", "N/A", NaN, Infinity, -1]) expect(num(v)).toBeNull();
  });
});

describe("parseFrameRate", () => {
  it("resolves a fraction", () => {
    expect(parseFrameRate("30000/1001")).toBe(29.97);
    expect(parseFrameRate("25/1")).toBe(25);
  });

  it("handles a bare number", () => {
    expect(parseFrameRate("24")).toBe(24);
  });

  it("returns null for 0/0 rather than NaN or Infinity", () => {
    expect(parseFrameRate("0/0")).toBeNull();
    expect(parseFrameRate(undefined)).toBeNull();
  });
});

describe("parseProbe", () => {
  it("reads duration, dimensions, codecs and fps", () => {
    const p = parseProbe(probeJson());
    expect(p).toMatchObject({
      durationSeconds: 8.033,
      width: 1280,
      height: 720,
      fps: 29.97,
      videoCodec: "h264",
      audioCodec: "aac",
      hasAudio: true,
      hasVideo: true,
    });
  });

  it("falls back to a stream duration when the container has none", () => {
    const p = parseProbe(probeJson({ format: {}, streams: [{ codec_type: "video", duration: "4.5" }] }));
    expect(p.durationSeconds).toBe(4.5);
  });

  it("reports an audio-only file as having no video", () => {
    const p = parseProbe(probeJson({ streams: [{ codec_type: "audio", codec_name: "mp3" }] }));
    expect(p.hasVideo).toBe(false);
    expect(p.hasAudio).toBe(true);
    expect(p.width).toBeNull();
  });

  it("returns the empty probe for unparseable output rather than throwing", () => {
    expect(parseProbe("not json")).toEqual(EMPTY_PROBE);
    expect(parseProbe("")).toEqual(EMPTY_PROBE);
  });

  it("survives a probe with no streams at all", () => {
    const p = parseProbe(JSON.stringify({ format: { duration: "3" } }));
    expect(p.durationSeconds).toBe(3);
    expect(p.hasVideo).toBe(false);
  });
});

describe("wholeSeconds", () => {
  it("rounds for the integer column", () => {
    expect(wholeSeconds(8.033)).toBe(8);
    expect(wholeSeconds(7.6)).toBe(8);
  });

  it("keeps unknown as unknown, never 0", () => {
    expect(wholeSeconds(null)).toBeNull();
  });
});

describe("mismatches", () => {
  const probe = { ...EMPTY_PROBE, durationSeconds: 7.6, width: 1280, height: 720 };

  it("is silent when the claim matches", () => {
    expect(mismatches(probe, { durationSeconds: 7.6, width: 1280, height: 720 })).toEqual([]);
  });

  it("tolerates sub-half-second rounding", () => {
    expect(mismatches(probe, { durationSeconds: 7.9 })).toEqual([]);
  });

  it("reports a duration a vendor overstated", () => {
    const out = mismatches(probe, { durationSeconds: 8 });
    expect(out).toHaveLength(0); // 0.4s is within tolerance
    expect(mismatches(probe, { durationSeconds: 10 })[0]).toContain("claimed 10s, file is 7.6s");
  });

  it("reports mismatched dimensions", () => {
    expect(mismatches(probe, { width: 1920 })[0]).toContain("claimed 1920, file is 1280");
  });

  it("says nothing when there is nothing to compare against", () => {
    expect(mismatches(EMPTY_PROBE, { durationSeconds: 8 })).toEqual([]);
    expect(mismatches(probe, {})).toEqual([]);
  });
});
