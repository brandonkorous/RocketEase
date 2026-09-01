/*
 * The voice-over adapter.
 *
 * SYNCHRONOUS, unlike sora: /audio/speech returns the mp3 in the response, so
 * `start` does the whole job and runMediaJobNow runs it inline. There is no
 * remote job id to reconcile against, which is why `reconcile` can only answer
 * from this process — the same limitation the images adapter documents.
 *
 * It routes through the registry like everything else, so a voice-over is
 * metered, capped and credited rather than being a quiet side-effect of making
 * a video.
 */
import type { MediaAdapter } from "../adapter";
import { estimate } from "../cost";
import { MediaError, type GenerationSpec, type MediaJobState, type RawOutput } from "../types";
import { DEFAULT_VOICE, SPEECH_MODELS, SPEECH_VOICES, type SpeechVoice } from "./models";
import { normalizeWords, textFromWords, type Transcript } from "../transcribe";
import { speak, transcribeAudio, type SpeechConfig } from "./transport";

const attempted = new Set<string>();

const config = (): SpeechConfig | null => {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_SPEECH_DEPLOYMENT;
  const apiVersion = process.env.AZURE_OPENAI_SPEECH_API_VERSION;
  if (!endpoint || !apiKey || !deployment || !apiVersion) return null;
  return { endpoint, apiKey, deployment, apiVersion };
};

/** A stock voice, or a refusal naming the ones that exist. */
export function voiceFor(spec: GenerationSpec): SpeechVoice {
  const asked = spec.voiceId;
  if (!asked) return DEFAULT_VOICE;
  if (!(SPEECH_VOICES as readonly string[]).includes(asked)) {
    throw new MediaError(`No such voice "${asked}". This model reads in ${SPEECH_VOICES.join(", ")}.`, { category: "validation" });
  }
  return asked as SpeechVoice;
}

/** What we were billed for: the characters we sent, counted here. */
export const charactersOf = (spec: GenerationSpec): number => spec.prompt.trim().length;

export function speechAdapter(): MediaAdapter {
  return {
    key: "azure-speech",
    // The whole job happens in start(); nothing is queued and nothing polls.
    synchronous: true,
    models: () => SPEECH_MODELS,
    configured: () => config() !== null,
    estimate: (model, spec) => estimate(model, spec),

    async start(model, spec, idempotencyKey) {
      const c = config();
      if (!c) throw new MediaError("Voice-over is not configured.", { category: "unconfigured" });
      const script = spec.prompt.trim();
      if (!script) throw new MediaError("There is nothing to read out.", { category: "validation" });

      attempted.add(idempotencyKey);
      const audio = await speak(c, { input: script, voice: voiceFor(spec) });
      results.set(idempotencyKey, { audio, charactersBilled: script.length });
      return { adapter: "azure-speech", modelKey: model.key, remoteJobId: idempotencyKey, idempotencyKey };
    },

    async poll(handle): Promise<MediaJobState> {
      const bytes = results.get(handle.idempotencyKey);
      if (!bytes) throw new MediaError("The voice-over was not held by this process.", { category: "unknown", ambiguous: true });
      return {
        handle,
        status: "succeeded",
        outputUrls: [handle.idempotencyKey],
        usage: { quantity: bytes.charactersBilled, unit: "characters" },
      };
    },

    async fetch(state): Promise<RawOutput[]> {
      const bytes = results.get(state.handle.idempotencyKey);
      if (!bytes) throw new MediaError("The voice-over bytes are gone.", { category: "temporary" });
      return [{ bytes: bytes.audio, claimedMimeType: "audio/mpeg" }];
    },

    /**
     * Word timings for captions.
     *
     * A SEPARATE deployment from the voice, on the same account: whisper is the
     * model where word-level timestamps are documented, and it is quota'd per
     * request rather than per token. Absent that deployment this is simply not
     * offered, and the transcribe handler falls through to the next adapter
     * rather than failing.
     */
    async transcribe(req) {
      const c = config();
      const deployment = process.env.AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT;
      if (!c || !deployment) throw new MediaError("Transcription is not configured.", { category: "unconfigured" });

      const raw = await transcribeAudio(c, deployment, { bytes: req.bytes, mimeType: req.mimeType, language: req.language });
      // Seconds on the wire, milliseconds everywhere in this codebase.
      const words = normalizeWords(
        (raw.words ?? []).map((w) => ({ text: w.word ?? "", startMs: Math.round((w.start ?? 0) * 1000), endMs: Math.round((w.end ?? 0) * 1000) })),
      );
      const transcript: Transcript = {
        language: raw.language ?? req.language ?? "und",
        // Derived from the words, never the vendor's separate text field: the
        // words are what the captions are built from, so the two cannot drift.
        text: words.length ? textFromWords(words) : (raw.text ?? "").trim(),
        words,
        durationSeconds: raw.duration,
      };
      return transcript;
    },

    async reconcile(idempotencyKey) {
      if (!attempted.has(idempotencyKey)) return null;
      throw new MediaError(
        "A voice-over was requested and its result was lost. /audio/speech exposes no job id, so it cannot be looked up — resolve it by hand before retrying.",
        { category: "unknown", ambiguous: true },
      );
    },
  };
}

/** In-memory, because the bytes arrive and are consumed in the same tick. */
const results = new Map<string, { audio: Uint8Array; charactersBilled: number }>();

export { SPEECH_MODELS, SPEECH_VOICES, DEFAULT_VOICE } from "./models";
export type { SpeechVoice } from "./models";
/** Tests only. */
export const __resetSpeech = () => { attempted.clear(); results.clear(); };
