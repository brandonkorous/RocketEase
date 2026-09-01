/*
 * gpt-4o-mini-tts on Azure OpenAI. Voice-over, and nothing else.
 *
 * A FOURTH data plane: /audio/speech answers with the audio bytes in the HTTP
 * response, so unlike sora there is no job to poll and unlike images there is
 * no usage block to read. That shapes everything below — the adapter is
 * synchronous, and the billed quantity is the input length we can count
 * ourselves rather than a number a vendor hands back.
 */
import type { ModelDescriptor } from "../io";

const SOURCE = "https://learn.microsoft.com/azure/ai-services/openai/";
const CHECKED_AT = "2026-09-01";

/**
 * The stock voices. No consent record is needed for these — they are the
 * vendor's own synthetic voices, not a likeness of anybody
 * (lib/media/voice/policy.ts gates the ones that are).
 */
export const SPEECH_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] as const;
export type SpeechVoice = (typeof SPEECH_VOICES)[number];
export const DEFAULT_VOICE: SpeechVoice = "alloy";

export const SPEECH_MODELS: ModelDescriptor[] = [
  {
    key: "azure-gpt-4o-mini-tts",
    vendorModelId: "gpt-4o-mini-tts",
    label: "GPT-4o mini TTS (Azure)",
    kind: "audio",
    adapter: "azure-speech",
    jobs: ["voiceover"],
    io: {
      inputs: { text: true },
      outputs: {
        container: "mp3",
        resolutions: [],
        aspects: [],
        // No fixed ceiling: length is whatever the script takes to read.
        duration: { min: 1, max: 600 },
        audio: "separate",
        count: { min: 1, max: 1 },
        delivery: "bytes",
      },
    },
    /*
     * Billed per CHARACTER of input. Azure meters this model in tokens and
     * returns none of them on /audio/speech, so characters is the one quantity
     * both sides can agree on and it is exactly what we sent.
     */
    cost: { unit: "characters", amountUsd: null, verified: false, sourceUrl: SOURCE },
    /*
     * No C2PA. Confirmed by probing real output rather than assumed — the mp3
     * carries no manifest, which matters because a voice-over is synthetic
     * media and its disclosure cannot ride on a credential that is not there.
     */
    provenance: { c2pa: false, watermark: null },
    terms: { commercialUse: true, indemnity: null, trainingOptOut: null, sourceUrl: SOURCE },
    checkedAt: CHECKED_AT,
  },
];
