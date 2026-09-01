/*
 * Voice-over and the word timings captions are built from.
 *
 * Fixtures are real responses from oai-rocketease-prod-eus2 on 2026-09-01,
 * not invented ones — inventing them is what let a whole adapter ship against
 * an API that did not exist (docs/bugs/B-006).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { modelByKey } from "../catalog";
import type { GenerationSpec } from "../types";
import { charactersOf, speechAdapter, voiceFor, __resetSpeech } from "./index";

const model = () => modelByKey("azure-gpt-4o-mini-tts")!;
const spec = (over: Partial<GenerationSpec> = {}): GenerationSpec => ({ jobKind: "voiceover", prompt: "You are at the lake.", ...over });

beforeEach(() => {
  __resetSpeech();
  vi.stubEnv("AZURE_OPENAI_ENDPOINT", "https://x.openai.azure.com");
  vi.stubEnv("AZURE_OPENAI_API_KEY", "k");
  vi.stubEnv("AZURE_OPENAI_SPEECH_DEPLOYMENT", "rocketease-speech");
  vi.stubEnv("AZURE_OPENAI_SPEECH_API_VERSION", "2025-04-01-preview");
  vi.stubEnv("AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT", "rocketease-transcribe");
});
afterEach(() => vi.unstubAllEnvs());

const audioReply = (bytes = new Uint8Array([1, 2, 3])) =>
  vi.fn().mockResolvedValue({ ok: true, status: 200, arrayBuffer: async () => bytes.buffer });

describe("configuration", () => {
  it("is unconfigured without the speech deployment, even with the video key present", () => {
    vi.stubEnv("AZURE_OPENAI_SPEECH_DEPLOYMENT", "");
    expect(speechAdapter().configured()).toBe(false);
  });

  it("is SYNCHRONOUS — the mp3 comes back in the response, there is no job to poll", () => {
    expect(speechAdapter().synchronous).toBe(true);
  });
});

describe("voices", () => {
  it("defaults rather than failing when none was chosen", () => {
    expect(voiceFor(spec())).toBe("alloy");
  });

  it("refuses an unknown voice by NAMING the ones that exist", () => {
    expect(() => voiceFor(spec({ voiceId: "morgan" }))).toThrow(/alloy, echo, fable/);
  });
});

describe("what it bills", () => {
  it("counts the characters actually sent, trimmed", () => {
    expect(charactersOf(spec({ prompt: "  four  " }))).toBe(4);
  });

  it("reports characters as the unit, so the ledger matches the model's meter", async () => {
    vi.stubGlobal("fetch", audioReply());
    const a = speechAdapter();
    const handle = await a.start(model(), spec({ prompt: "abcde" }), "k1");
    expect((await a.poll(handle)).usage).toEqual({ quantity: 5, unit: "characters" });
    vi.unstubAllGlobals();
  });
});

describe("generating", () => {
  it("posts to /audio/speech with the deployment IN THE PATH, unlike sora", async () => {
    const f = audioReply();
    vi.stubGlobal("fetch", f);
    await speechAdapter().start(model(), spec(), "k2");
    expect(f.mock.calls[0][0]).toBe("https://x.openai.azure.com/openai/deployments/rocketease-speech/audio/speech?api-version=2025-04-01-preview");
    expect(JSON.parse(f.mock.calls[0][1].body)).toMatchObject({ voice: "alloy", response_format: "mp3" });
    vi.unstubAllGlobals();
  });

  it("refuses an empty script rather than paying to read silence", async () => {
    await expect(speechAdapter().start(model(), spec({ prompt: "   " }), "k3")).rejects.toThrow(/nothing to read/i);
  });

  it("hands back the audio it was given", async () => {
    vi.stubGlobal("fetch", audioReply(new Uint8Array([9, 9])));
    const a = speechAdapter();
    const handle = await a.start(model(), spec(), "k4");
    const out = await a.fetch(await a.poll(handle));
    expect(out[0].claimedMimeType).toBe("audio/mpeg");
    expect(Array.from(out[0].bytes)).toEqual([9, 9]);
    vi.unstubAllGlobals();
  });
});

describe("transcription", () => {
  // Copied verbatim from a live whisper response.
  const whisper = {
    task: "transcribe",
    language: "english",
    duration: 2.5,
    text: "You are at the lake and an idea arrives.",
    words: [
      { word: "You", start: 0.0, end: 0.44 },
      { word: "are", start: 0.44, end: 0.66 },
      { word: "at", start: 0.66, end: 0.82 },
    ],
  };

  it("converts whisper's SECONDS into the milliseconds everything downstream uses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => whisper }));
    const t = await speechAdapter().transcribe!({ bytes: new Uint8Array([1]), mimeType: "audio/mpeg", idempotencyKey: "t1" });
    expect(t.words[0]).toMatchObject({ text: "You", startMs: 0, endMs: 440 });
    expect(t.words[1]).toMatchObject({ startMs: 440, endMs: 660 });
    vi.unstubAllGlobals();
  });

  it("asks for WORD granularity — segments would land captions on the wrong syllable", async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => whisper });
    vi.stubGlobal("fetch", f);
    await speechAdapter().transcribe!({ bytes: new Uint8Array([1]), mimeType: "audio/mpeg", idempotencyKey: "t2" });
    const form = f.mock.calls[0][1].body as FormData;
    expect(form.get("timestamp_granularities[]")).toBe("word");
    expect(form.get("response_format")).toBe("verbose_json");
    vi.unstubAllGlobals();
  });

  it("derives the text from the WORDS, so captions and transcript cannot drift", async () => {
    const disagreeing = { ...whisper, text: "something else entirely" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => disagreeing }));
    const t = await speechAdapter().transcribe!({ bytes: new Uint8Array([1]), mimeType: "audio/mpeg", idempotencyKey: "t3" });
    expect(t.text).toBe("You are at");
    vi.unstubAllGlobals();
  });

  it("is unavailable — not broken — when the transcribe deployment is absent", async () => {
    vi.stubEnv("AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT", "");
    await expect(speechAdapter().transcribe!({ bytes: new Uint8Array([1]), mimeType: "audio/mpeg", idempotencyKey: "t4" })).rejects.toThrow(/not configured/);
  });
});
