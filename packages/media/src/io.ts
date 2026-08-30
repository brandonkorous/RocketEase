/*
 * What a model accepts and what it returns.
 *
 * This is the contract that makes models interchangeable. The spread is real:
 * Sora takes `seconds: 16 | 20` and nothing else; Veo does 8s extendable past a
 * minute; Kling and Seedance do 15s multi-shot. Veo/Kling/Seedance/Sora embed
 * audio in the MP4, ElevenLabs returns it separately. Sora's download URL dies
 * in an hour.
 *
 * None of that can be pushed up to the composer, so every model declares it and
 * the UI offers only what the routed model actually supports.
 */
import type { CostUnit, JobKind, MediaKind } from "./types";

export type ReferenceRole = "subject" | "style" | "ingredient" | "source" | "driving";

export type ModelInputs = {
  text: boolean;
  referenceImages?: { max: number; role: ReferenceRole };
  referenceVideos?: { max: number };
  referenceAudio?: { max: number };
  firstFrame?: boolean;
  lastFrame?: boolean;
  /** Aleph-style: edit footage that already exists. */
  sourceVideo?: boolean;
  /** Act-Two-style: a driving performance video. */
  drivingPerformance?: boolean;
  negativePrompt?: boolean;
  seed?: boolean;
};

export type ModelOutputs = {
  container: "mp4" | "png" | "jpeg" | "webp" | "mp3" | "wav" | "json";
  resolutions: string[];
  aspects: string[];
  /** `allowed` beats `min`/`max` when a model only accepts specific values. */
  duration?: { min: number; max: number; step?: number; allowed?: number[] };
  audio: "none" | "embedded" | "separate";
  count: { min: number; max: number };
  delivery: "bytes" | "url";
  /** A deadline, not trivia: bytes must be pulled before this elapses. */
  urlTtlSeconds?: number;
  extendable?: boolean;
};

export type ModelIO = { inputs: ModelInputs; outputs: ModelOutputs };

/** Cost basis, verified against the vendor's own page or flagged as not. */
export type ModelCost = { unit: CostUnit; amountUsd: number | null; verified: boolean; sourceUrl: string };

export type ModelTerms = {
  commercialUse: boolean;
  /** `null` = the vendor does not say. Deliberately not the same as `false`. */
  indemnity: boolean | null;
  trainingOptOut: boolean | null;
  sourceUrl: string;
};

export type ModelDescriptor = {
  /** Ours, stable, and written into every media_job row forever. */
  key: string;
  adapter: string;
  /** The EXACT vendor string. Pinned, never constructed at runtime. */
  vendorModelId: string;
  label: string;
  kind: MediaKind;
  jobs: JobKind[];
  io: ModelIO;
  cost: ModelCost;
  provenance: { c2pa: boolean; watermark: "synthid" | "vendor" | null };
  terms: ModelTerms;
  /** Why this is unavailable right now, keyed like Capabilities.reasons. */
  reasons?: Partial<Record<string, string>>;
  /** When a person last read the vendor's documentation. Ages into the quality sweep. */
  checkedAt: string;
  /** Kept forever once set, so old jobs still resolve to a readable name. */
  retiredAt?: string;
};

/** Does this model's declared duration support cover what was asked for? */
export function supportsDuration(io: ModelIO, seconds: number | undefined): boolean {
  const d = io.outputs.duration;
  if (seconds === undefined) return true;
  if (!d) return false;
  if (d.allowed) return d.allowed.includes(seconds);
  return seconds >= d.min && seconds <= d.max;
}

/** The nearest duration a model will actually accept, for an honest "rounded to" note. */
export function nearestDuration(io: ModelIO, seconds: number): number | null {
  const d = io.outputs.duration;
  if (!d) return null;
  if (d.allowed?.length) {
    return d.allowed.reduce((best, v) => (Math.abs(v - seconds) < Math.abs(best - seconds) ? v : best), d.allowed[0]);
  }
  const clamped = Math.min(Math.max(seconds, d.min), d.max);
  if (!d.step) return clamped;
  const stepped = d.min + Math.round((clamped - d.min) / d.step) * d.step;
  return Math.min(Math.max(stepped, d.min), d.max);
}

/** How many references of each kind a model will take, so callers can downsample honestly. */
export function referenceCapacity(io: ModelIO): { images: number; videos: number; audio: number } {
  return {
    images: io.inputs.referenceImages?.max ?? 0,
    videos: io.inputs.referenceVideos?.max ?? 0,
    audio: io.inputs.referenceAudio?.max ?? 0,
  };
}

export const isRetired = (m: ModelDescriptor, now = new Date()) => Boolean(m.retiredAt && new Date(m.retiredAt) <= now);

/** Descriptors not re-checked in this long are stale enough to surface as a data-quality finding. */
export const CHECKED_AT_MAX_AGE_DAYS = 90;

export function isStale(m: ModelDescriptor, now = new Date(), maxAgeDays = CHECKED_AT_MAX_AGE_DAYS): boolean {
  const checked = new Date(m.checkedAt);
  if (Number.isNaN(checked.getTime())) return true;
  return now.getTime() - checked.getTime() > maxAgeDays * 86_400_000;
}
