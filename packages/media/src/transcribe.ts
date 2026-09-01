/*
 * Speech to text.
 *
 * A separate shape from generation on purpose. Generation takes a prompt and
 * produces bytes; transcription takes BYTES THAT ALREADY EXIST and produces
 * structure. Forcing it through `GenerationSpec` would mean a prompt field that
 * means nothing and a `RawOutput` whose bytes are secretly JSON.
 *
 * What decides a vendor here is not the last half-point of word error rate: it
 * is **word-level timestamps** and **speaker labels**, because those are what a
 * social caption is built from (docs/research/ai-media-2026.md §10). Every
 * serious vendor provides both, so the contract requires them.
 */
import type { MediaError } from "./types";

export type TranscriptWord = {
  text: string;
  startMs: number;
  endMs: number;
  /** Vendor's diarization label ("speaker_0"). Absent when not requested. */
  speaker?: string;
};

export type Transcript = {
  /** What the vendor DETECTED, which may differ from what was asked for. */
  language: string;
  text: string;
  words: TranscriptWord[];
  /** 0–1 where the vendor reports one. Undefined is honest; 0 is not. */
  confidence?: number;
  /** Billable audio length as the vendor counted it. */
  durationSeconds?: number;
};

export type TranscribeRequest = {
  bytes: Uint8Array;
  mimeType: string;
  /** BCP-47 hint. Omit to let the vendor detect it. */
  language?: string;
  diarize?: boolean;
  /**
   * The probed duration of the source. Passed because the caller already knows
   * it and vendors bill by audio minute — it makes the estimate honest before
   * the call rather than after.
   */
  durationSeconds?: number;
  /** Never bypassed, exactly like a generation. */
  idempotencyKey: string;
};

/**
 * Optional on `MediaAdapter`, like `fetchInbox?` on a provider: an image vendor
 * has no business pretending it does speech to text.
 *
 * Deliberately synchronous-looking. Batch STT is fast enough to run inside a
 * worker job with a generous expiry; if a vendor needs a webhook, that belongs
 * behind this method rather than leaking a second polling loop into the queue
 * layer. Throwing a MediaError with `ambiguous` still means "we may have been
 * billed" — the handler checks our own caption_track before re-spending.
 */
export type Transcriber = (req: TranscribeRequest) => Promise<Transcript>;

export const EMPTY_TRANSCRIPT: Transcript = { language: "und", text: "", words: [] };

/** Words are the source of truth; the flat text is derived so they cannot drift. */
export const textFromWords = (words: TranscriptWord[]): string =>
  words
    .map((w) => w.text.trim())
    .filter(Boolean)
    .join(" ");

/** Sorted, non-overlapping, non-negative — the shape everything downstream assumes. */
export function normalizeWords(words: TranscriptWord[]): TranscriptWord[] {
  const sorted = words
    .filter((w) => w.text.trim().length > 0 && Number.isFinite(w.startMs) && Number.isFinite(w.endMs))
    .map((w) => ({ ...w, startMs: Math.max(0, Math.round(w.startMs)), endMs: Math.max(0, Math.round(w.endMs)) }))
    .filter((w) => w.endMs >= w.startMs)
    .sort((a, b) => a.startMs - b.startMs);

  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].endMs > sorted[i + 1].startMs) sorted[i].endMs = sorted[i + 1].startMs;
  }
  return sorted.filter((w) => w.endMs > w.startMs);
}

export type TranscribeError = MediaError;
