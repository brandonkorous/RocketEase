/*
 * The media generation contract — the shapes every adapter, worker and UI in
 * the pipeline agrees on. Pure and client-safe: nothing here calls a vendor,
 * touches a database, or reads a key.
 *
 * Errors mirror @rocketease/providers' ProviderError deliberately. Generation
 * is a SPEND mutation, so it inherits the publishing discipline: an ambiguous
 * result is reconciled against the vendor before anything is retried.
 */

/**
 * The unit routing is done on. "Make a video" is not routable; "put this
 * packshot in motion without warping the label" is (docs/media-models.md §2).
 */
export const JOB_KINDS = [
  "product_still",
  "scene_still",
  "typographic_still",
  "product_motion",
  "hero_shot",
  "sequence",
  "broll",
  "footage_edit",
  "performance",
  "voiceover",
  "music",
  "sfx",
  "transcribe",
  "dub",
] as const;
export type JobKind = (typeof JOB_KINDS)[number];

export const JOB_KIND_LABELS: Record<JobKind, string> = {
  product_still: "Product still",
  scene_still: "Scene still",
  typographic_still: "Typographic still",
  product_motion: "Product in motion",
  hero_shot: "Hero shot",
  sequence: "Multi-shot sequence",
  broll: "B-roll",
  footage_edit: "Footage edit",
  performance: "Performance",
  voiceover: "Voice-over",
  music: "Music",
  sfx: "Sound effect",
  transcribe: "Transcription",
  dub: "Dub",
};

/** What a job produces, which decides how the output enters the library. */
export type MediaKind = "image" | "video" | "audio" | "text";

export const MEDIA_KIND_OF: Record<JobKind, MediaKind> = {
  product_still: "image",
  scene_still: "image",
  typographic_still: "image",
  product_motion: "video",
  hero_shot: "video",
  sequence: "video",
  broll: "video",
  footage_edit: "video",
  performance: "video",
  voiceover: "audio",
  music: "audio",
  sfx: "audio",
  transcribe: "text",
  dub: "audio",
};

/** A stored asset offered to a model as a reference, resolved to bytes by the caller. */
export type ReferenceInput = {
  assetId: string;
  role: "product" | "logo" | "talent" | "style" | "source" | "driving";
  /** Signed read URL, or inline bytes — whichever the adapter needs. */
  url?: string;
  bytes?: Uint8Array;
  mimeType?: string;
};

/** Everything a generation request carries. Stored verbatim on `media_job.spec`. */
export type GenerationSpec = {
  jobKind: JobKind;
  prompt: string;
  negativePrompt?: string;
  references?: ReferenceInput[];
  /** Seconds for motion and audio; ignored for stills. */
  durationSeconds?: number;
  aspect?: string;
  resolution?: string;
  count?: number;
  seed?: number;
  language?: string;
  voiceId?: string;
  /** Description for the produced asset. Kept on the spec so a job finished by
   * the poller hours later still lands with it. */
  altText?: string;
  /** Set only when a person pinned a model in the UI; routing honours it. */
  modelKey?: string;
};

export type MediaJobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

/** What `start()` hands back — everything needed to poll and to reconcile. */
export type MediaJobHandle = {
  adapter: string;
  modelKey: string;
  remoteJobId: string;
  idempotencyKey: string;
  /** Vendor payload we may need on the way back; never contains a credential. */
  meta?: Record<string, unknown>;
};

export type MediaJobState = {
  handle: MediaJobHandle;
  status: MediaJobStatus;
  /** 0–100 where the vendor reports it; undefined is honest, 0 would not be. */
  progress?: number;
  /** Populated on `succeeded`; may expire — fetch promptly (Sora: ~1 hour). */
  outputUrls?: string[];
  expiresAt?: string;
  error?: MediaError;
  /**
   * What the vendor says it charged or consumed, when it says anything.
   *
   * `tokens` is the MEASUREMENT; costUsd is derived from it and a rate we
   * configure. Keeping only the money throws away the one number that can be
   * re-priced when a rate turns out to be wrong — which is what happened.
   */
  usage?: { quantity: number; unit: CostUnit; costUsd?: number; tokens?: { inputTokens: number; outputTokens: number } };
};

/** Bytes as the vendor delivered them, before normalization probes and stores. */
export type RawOutput = {
  bytes: Uint8Array;
  /** What the vendor CLAIMS. Normalization verifies it and records disagreements. */
  claimedMimeType?: string;
  claimedDurationSeconds?: number;
  claimedWidth?: number;
  claimedHeight?: number;
};

export const COST_UNITS = ["video_seconds", "audio_seconds", "characters", "images", "renders", "tokens"] as const;
export type CostUnit = (typeof COST_UNITS)[number];

export const COST_UNIT_LABELS: Record<CostUnit, string> = {
  video_seconds: "seconds of video",
  audio_seconds: "seconds of audio",
  characters: "characters",
  images: "images",
  renders: "renders",
  tokens: "tokens",
};

/**
 * An estimate, or an honest refusal to guess. A model with no configured rate
 * returns `{ unknown }` — never a confident wrong number (docs/media-generation.md §9).
 */
export type CostEstimate =
  | { quantity: number; unit: CostUnit; amountUsd: number | null; verified: boolean }
  | { unknown: string };

export const isUnknownCost = (e: CostEstimate): e is { unknown: string } => "unknown" in e;

export type MediaErrorCategory = "unconfigured" | "validation" | "permission" | "rate_limit" | "policy" | "temporary" | "unknown";

/**
 * `ambiguous` is the important flag: it means we cannot tell whether the vendor
 * started work we will be billed for. The worker reconciles before re-spending.
 */
export class MediaError extends Error {
  readonly category: MediaErrorCategory;
  readonly retryable: boolean;
  readonly ambiguous: boolean;
  readonly vendorCode?: string;
  readonly retryAfterSeconds?: number;

  constructor(
    message: string,
    opts: { category: MediaErrorCategory; retryable?: boolean; ambiguous?: boolean; vendorCode?: string; retryAfterSeconds?: number; cause?: unknown },
  ) {
    super(message, { cause: opts.cause });
    this.name = "MediaError";
    this.category = opts.category;
    this.retryable = opts.retryable ?? (opts.category === "temporary" || opts.category === "rate_limit");
    this.ambiguous = opts.ambiguous ?? false;
    this.vendorCode = opts.vendorCode;
    this.retryAfterSeconds = opts.retryAfterSeconds;
  }
}
