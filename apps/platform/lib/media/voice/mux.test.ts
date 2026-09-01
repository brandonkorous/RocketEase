/*
 * Mixing a voice over a generated clip, against real files.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { muxVoiceover, voiceOverrun, DELIVERY_SAMPLE_RATE } from "./mux";

describe("voiceOverrun", () => {
  it("is null when the voice fits", () => {
    expect(voiceOverrun(12, 9)).toBeNull();
  });

  it("reports the seconds that will be cut off", () => {
    expect(voiceOverrun(12, 14.5)).toBe(2.5);
  });

  it("ignores a rounding sliver rather than crying wolf on every clip", () => {
    expect(voiceOverrun(12, 12.05)).toBeNull();
  });

  it("says nothing rather than guessing when a duration is unknown", () => {
    expect(voiceOverrun(null, 9)).toBeNull();
    expect(voiceOverrun(12, null)).toBeNull();
  });
});

const has = (bin: string) => {
  try { execFileSync(bin, ["-version"], { stdio: "ignore" }); return true; } catch { return false; }
};

describe.runIf(has("ffmpeg") && has("ffprobe"))("muxVoiceover", () => {
  const dir = mkdtempSync(join(tmpdir(), "rke-mux-test-"));
  const make = () => {
    const v = join(dir, "v.mp4");
    const a = join(dir, "a.mp3");
    // 3s of colour at 96 kHz — the rate Sora actually returns.
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=blue:s=320x568:d=3",
      "-f", "lavfi", "-i", "sine=frequency=200:sample_rate=96000:duration=3",
      "-c:v", "libx264", "-c:a", "aac", "-ar", "96000", "-shortest", v]);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=800:duration=2", a]);
    return { video: readFileSync(v), voice: readFileSync(a) };
  };

  it("emits 48 kHz, whatever the source was — 96 kHz is outside every network's spec", async () => {
    const { video, voice } = make();
    const res = await muxVoiceover({ video, voice, videoSeconds: 3, voiceSeconds: 2 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const out = join(dir, "out.mp4");
    writeFileSync(out, res.bytes);
    const rate = execFileSync("ffprobe", ["-v", "error", "-select_streams", "a:0",
      "-show_entries", "stream=sample_rate", "-of", "csv=p=0", out]).toString().trim();
    expect(Number(rate)).toBe(DELIVERY_SAMPLE_RATE);
    rmSync(dir, { recursive: true, force: true });
  }, 60_000);
});
