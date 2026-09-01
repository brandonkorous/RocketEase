import { beforeEach, describe, expect, it } from "vitest";
import { mockAdapter } from "./index";
import { MOCK_FALLBACK_SECONDS, mockTranscribe } from "./transcribe";
import { normalizeWords, textFromWords } from "../transcribe";

const req = (over: Partial<Parameters<typeof mockTranscribe>[0]> = {}) => ({
  bytes: new Uint8Array([1, 2, 3]),
  mimeType: "audio/mpeg",
  idempotencyKey: "k1",
  ...over,
});

describe("mockTranscribe", () => {
  it("scales word timings to the clip it was given", () => {
    const short = mockTranscribe(req({ durationSeconds: 5 }));
    const long = mockTranscribe(req({ durationSeconds: 60 }));
    expect(short.words.at(-1)!.endMs).toBeLessThan(5000);
    expect(long.words.at(-1)!.endMs).toBeGreaterThan(50_000);
  });

  it("states its fallback rather than silently assuming a length", () => {
    const t = mockTranscribe(req());
    expect(t.durationSeconds).toBe(MOCK_FALLBACK_SECONDS);
  });

  it("returns a real silence, so anything assuming contiguous words breaks HERE", () => {
    const { words } = mockTranscribe(req({ durationSeconds: 10 }));
    const gaps = words.slice(1).map((w, i) => w.startMs - words[i].endMs);
    expect(Math.max(...gaps)).toBeGreaterThan(600);
  });

  it("labels two speakers when diarization is asked for", () => {
    const { words } = mockTranscribe(req({ diarize: true }));
    expect(new Set(words.map((w) => w.speaker)).size).toBe(2);
  });

  it("omits speaker labels entirely when diarization is off", () => {
    const { words } = mockTranscribe(req({ diarize: false }));
    expect(words.every((w) => w.speaker === undefined)).toBe(true);
  });

  it("reports a confidence below 1, because vendors do", () => {
    expect(mockTranscribe(req()).confidence).toBeLessThan(1);
  });

  it("echoes a language hint rather than overriding it", () => {
    expect(mockTranscribe(req({ language: "fr" })).language).toBe("fr");
    expect(mockTranscribe(req()).language).toBe("en");
  });

  it("derives its flat text from the words, so the two cannot drift", () => {
    const t = mockTranscribe(req());
    expect(t.text).toBe(textFromWords(t.words));
  });
});

describe("normalizeWords", () => {
  it("sorts by start time", () => {
    const out = normalizeWords([
      { text: "b", startMs: 500, endMs: 900 },
      { text: "a", startMs: 0, endMs: 400 },
    ]);
    expect(out.map((w) => w.text)).toEqual(["a", "b"]);
  });

  it("trims an overlap rather than emitting words that fight each other", () => {
    const out = normalizeWords([
      { text: "a", startMs: 0, endMs: 900 },
      { text: "b", startMs: 500, endMs: 1000 },
    ]);
    expect(out[0].endMs).toBe(500);
  });

  it("drops blank, reversed and non-finite entries", () => {
    const out = normalizeWords([
      { text: "  ", startMs: 0, endMs: 100 },
      { text: "back", startMs: 900, endMs: 100 },
      { text: "nan", startMs: Number.NaN, endMs: 100 },
      { text: "ok", startMs: 1000, endMs: 1400 },
    ]);
    expect(out.map((w) => w.text)).toEqual(["ok"]);
  });

  it("drops a word an overlap trim collapsed to nothing", () => {
    const out = normalizeWords([
      { text: "a", startMs: 500, endMs: 900 },
      { text: "b", startMs: 500, endMs: 1000 },
    ]);
    expect(out.map((w) => w.text)).toEqual(["b"]);
  });
});

describe("the adapter's transcribe", () => {
  beforeEach(() => {
    process.env.MEDIA_ENABLE_MOCK = "1";
  });

  it("refuses when the adapter is off, rather than returning an empty transcript", async () => {
    delete process.env.MEDIA_ENABLE_MOCK;
    await expect(mockAdapter().transcribe!(req())).rejects.toThrow(/off/i);
  });

  it("returns words when it is on", async () => {
    const t = await mockAdapter().transcribe!(req({ durationSeconds: 12 }));
    expect(t.words.length).toBeGreaterThan(5);
  });
});
