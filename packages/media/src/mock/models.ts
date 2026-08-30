/*
 * Mock model descriptors.
 *
 * Not test doubles — a first-class adapter, the same role PROVIDERS_ENABLE_MOCK
 * plays for networks. They exercise the full submit → poll → fetch → normalize
 * loop with no network and no spend, and they deliberately declare AWKWARD
 * shapes so the pipeline meets them locally rather than in production:
 *
 *   - mock-video   fixed durations only (like Sora's 16|20) and a short URL TTL
 *   - mock-image   multi-reference, byte delivery, several at once
 *   - mock-audio   separate audio, character-billed (like TTS)
 */
import type { ModelDescriptor } from "../io";

const SOURCE = "https://rocketease.com/internal/mock";
const CHECKED_AT = "2026-08-30";

const terms = { commercialUse: true, indemnity: null, trainingOptOut: null, sourceUrl: SOURCE };

export const MOCK_MODELS: ModelDescriptor[] = [
  {
    key: "mock-image",
    adapter: "mock",
    vendorModelId: "mock-image-1",
    label: "Mock image",
    kind: "image",
    jobs: ["product_still", "scene_still", "typographic_still"],
    io: {
      inputs: { text: true, referenceImages: { max: 9, role: "subject" }, negativePrompt: true, seed: true },
      outputs: {
        container: "png",
        resolutions: ["1024x1024", "1024x1536", "1536x1024"],
        aspects: ["1:1", "4:5", "9:16", "16:9"],
        audio: "none",
        count: { min: 1, max: 4 },
        delivery: "bytes",
      },
    },
    cost: { unit: "images", amountUsd: null, verified: false, sourceUrl: SOURCE },
    provenance: { c2pa: false, watermark: null },
    terms,
    checkedAt: CHECKED_AT,
  },
  {
    key: "mock-video",
    adapter: "mock",
    vendorModelId: "mock-video-1",
    label: "Mock video",
    kind: "video",
    jobs: ["product_motion", "hero_shot", "broll", "sequence"],
    io: {
      inputs: { text: true, referenceImages: { max: 3, role: "ingredient" }, firstFrame: true, seed: true },
      outputs: {
        container: "mp4",
        resolutions: ["1280x720", "1080x1920"],
        aspects: ["16:9", "9:16"],
        // Fixed values on purpose: the composer must read this, not assume a range.
        duration: { min: 4, max: 8, allowed: [4, 8] },
        audio: "embedded",
        count: { min: 1, max: 1 },
        delivery: "url",
        urlTtlSeconds: 3600,
      },
    },
    cost: { unit: "video_seconds", amountUsd: null, verified: false, sourceUrl: SOURCE },
    provenance: { c2pa: true, watermark: "vendor" },
    terms,
    checkedAt: CHECKED_AT,
  },
  {
    key: "mock-audio",
    adapter: "mock",
    vendorModelId: "mock-audio-1",
    label: "Mock audio",
    kind: "audio",
    jobs: ["voiceover", "music", "sfx"],
    io: {
      inputs: { text: true },
      outputs: {
        container: "mp3",
        resolutions: [],
        aspects: [],
        duration: { min: 1, max: 300 },
        audio: "separate",
        count: { min: 1, max: 1 },
        delivery: "bytes",
      },
    },
    cost: { unit: "characters", amountUsd: null, verified: false, sourceUrl: SOURCE },
    provenance: { c2pa: false, watermark: null },
    terms,
    checkedAt: CHECKED_AT,
  },
];
