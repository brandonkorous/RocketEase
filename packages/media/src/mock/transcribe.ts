/*
 * The mock transcriber.
 *
 * It does not listen to the audio — nothing local could — and it does not
 * pretend to. What it DOES do is return the awkward shapes a real vendor
 * returns, so the caption pipeline meets them here rather than in production:
 *
 *   - word-level timings that do not tile the clip perfectly (real speech has
 *     gaps, and a cue builder that assumes contiguity breaks on them)
 *   - a silence long enough to force a cue break
 *   - two speakers, because diarization changes the grouping
 *   - a confidence below 1, because vendors report one
 *
 * Timings scale to the caller's stated duration, so a 5s clip and a 60s clip
 * both produce plausible captions.
 */
import { normalizeWords, textFromWords, type Transcript, type TranscribeRequest, type TranscriptWord } from "../transcribe";

/** Two speakers and a natural pause, expressed as fractions of the clip. */
const SCRIPT: { text: string; at: number; to: number; speaker: string }[] = [
  { text: "Right,", at: 0.02, to: 0.08, speaker: "speaker_0" },
  { text: "here's", at: 0.09, to: 0.14, speaker: "speaker_0" },
  { text: "the", at: 0.15, to: 0.18, speaker: "speaker_0" },
  { text: "thing", at: 0.19, to: 0.26, speaker: "speaker_0" },
  { text: "nobody", at: 0.27, to: 0.34, speaker: "speaker_0" },
  { text: "tells", at: 0.35, to: 0.4, speaker: "speaker_0" },
  { text: "you.", at: 0.41, to: 0.47, speaker: "speaker_0" },
  // A real pause. Anything that assumes contiguous words fails here.
  { text: "Go", at: 0.62, to: 0.66, speaker: "speaker_1" },
  { text: "on", at: 0.67, to: 0.71, speaker: "speaker_1" },
  { text: "then,", at: 0.72, to: 0.79, speaker: "speaker_1" },
  { text: "tell", at: 0.8, to: 0.85, speaker: "speaker_1" },
  { text: "me.", at: 0.86, to: 0.95, speaker: "speaker_1" },
];

export const MOCK_TRANSCRIPT_CONFIDENCE = 0.94;
/** Used when the caller could not probe a duration. Stated, not guessed at silently. */
export const MOCK_FALLBACK_SECONDS = 8;

export function mockTranscribe(req: TranscribeRequest): Transcript {
  const seconds = req.durationSeconds && req.durationSeconds > 0 ? req.durationSeconds : MOCK_FALLBACK_SECONDS;
  const ms = seconds * 1000;
  const diarize = req.diarize ?? true;

  const words: TranscriptWord[] = SCRIPT.map((w) => ({
    text: w.text,
    startMs: Math.round(w.at * ms),
    endMs: Math.round(w.to * ms),
    ...(diarize ? { speaker: w.speaker } : {}),
  }));

  const normalized = normalizeWords(words);
  return {
    // Echo the hint when given; "en" is the mock's own detection, not a guess
    // dressed up as one.
    language: req.language ?? "en",
    text: textFromWords(normalized),
    words: normalized,
    confidence: MOCK_TRANSCRIPT_CONFIDENCE,
    durationSeconds: seconds,
  };
}
