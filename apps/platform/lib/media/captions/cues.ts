/*
 * Words → cues. The opinionated part of captioning.
 *
 * A transcript is a list of words with timings. A CAPTION is a sequence of short
 * blocks a person can read at a glance while the video plays. Turning one into
 * the other is where every bad captioning tool gives itself away: a wall of text
 * held for eight seconds, or a single word flashing for 80ms.
 *
 * The rules here, all deliberate:
 *   - a cue holds at most 2 lines of ~32 characters (a 9:16 canvas is narrow)
 *   - a cue lasts at most 3s and at least 0.8s, so nothing flashes
 *   - a speaker change ALWAYS breaks a cue — two people never share a block
 *   - a gap longer than 0.6s breaks a cue, because that is a sentence ending
 *   - sentence-final punctuation breaks a cue when the block is already usable
 *
 * Pure. Word timings in, cues out, no I/O.
 */
import type { CaptionWord } from "@/db/schema/voice";

export type Cue = {
  startMs: number;
  endMs: number;
  /** Already wrapped. One entry per rendered line, at most `maxLines`. */
  lines: string[];
  speaker?: string;
};

export type CueOptions = {
  maxCharsPerLine: number;
  maxLines: number;
  maxDurationMs: number;
  minDurationMs: number;
  /** Silence longer than this ends a cue. */
  gapBreakMs: number;
};

/** Tuned for 9:16, where a line of ~32 characters is about the full safe width. */
export const CUE_DEFAULTS: CueOptions = {
  maxCharsPerLine: 32,
  maxLines: 2,
  maxDurationMs: 3000,
  minDurationMs: 800,
  gapBreakMs: 600,
};

const SENTENCE_END = /[.!?…]["')\]]?$/;

/** Greedy wrap on whitespace. Returns null when it needs more lines than allowed. */
export function wrap(words: string[], maxChars: number, maxLines: number): string[] | null {
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length <= maxChars || !line) {
      line = next;
    } else {
      lines.push(line);
      line = w;
      if (lines.length > maxLines) return null;
    }
  }
  if (line) lines.push(line);
  return lines.length <= maxLines ? lines : null;
}

const clean = (w: CaptionWord) => w.text.trim();

/** Would adding this word still fit the character budget? */
const fits = (pending: CaptionWord[], next: CaptionWord, o: CueOptions) =>
  wrap([...pending, next].map(clean), o.maxCharsPerLine, o.maxLines) !== null;

function toCue(words: CaptionWord[], o: CueOptions): Cue | null {
  const texts = words.map(clean).filter(Boolean);
  if (!texts.length) return null;
  const lines = wrap(texts, o.maxCharsPerLine, o.maxLines) ?? [texts.join(" ")];
  const startMs = words[0].startMs;
  // A short block is held to the floor so it does not flash — but never past the
  // next cue's start, which the caller enforces by construction (cues are ordered).
  const endMs = Math.max(words[words.length - 1].endMs, startMs + o.minDurationMs);
  return { startMs, endMs, lines, speaker: words[0].speaker };
}

/** True when this word must start a new cue regardless of how full the current one is. */
function forcesBreak(prev: CaptionWord, next: CaptionWord, o: CueOptions): boolean {
  if ((prev.speaker ?? "") !== (next.speaker ?? "")) return true;
  return next.startMs - prev.endMs > o.gapBreakMs;
}

/**
 * Group words into cues. Overlapping cues are impossible by construction: a cue
 * ends before the next one's first word, and the minimum-duration floor is
 * trimmed back rather than allowed to run over.
 */
export function buildCues(words: CaptionWord[], options: Partial<CueOptions> = {}): Cue[] {
  const o = { ...CUE_DEFAULTS, ...options };
  const usable = words.filter((w) => clean(w).length > 0 && w.endMs >= w.startMs);
  const cues: Cue[] = [];
  let pending: CaptionWord[] = [];

  const flush = () => {
    const cue = pending.length ? toCue(pending, o) : null;
    if (cue) cues.push(cue);
    pending = [];
  };

  for (const word of usable) {
    if (!pending.length) {
      pending = [word];
      continue;
    }
    const prev = pending[pending.length - 1];
    const tooLong = word.endMs - pending[0].startMs > o.maxDurationMs;
    if (forcesBreak(prev, word, o) || tooLong || !fits(pending, word, o)) {
      flush();
      pending = [word];
      continue;
    }
    pending.push(word);
    // A finished sentence is the best place to break, once the block reads well.
    if (SENTENCE_END.test(clean(word)) && word.endMs - pending[0].startMs >= o.minDurationMs) flush();
  }
  flush();

  return trimOverlaps(cues);
}

/** The minimum-duration floor can push a cue into the next one. Give way. */
function trimOverlaps(cues: Cue[]): Cue[] {
  for (let i = 0; i < cues.length - 1; i++) {
    if (cues[i].endMs > cues[i + 1].startMs) cues[i].endMs = cues[i + 1].startMs;
  }
  return cues.filter((c) => c.endMs > c.startMs);
}

export const cueText = (c: Cue): string => c.lines.join("\n");

/**
 * Characters per second. Not enforced — the audio dictates the timing and we
 * cannot slow it down — but reported, because a cue nobody can read in time is
 * a quality problem a person should see.
 */
export function charsPerSecond(cue: Cue): number {
  const seconds = (cue.endMs - cue.startMs) / 1000;
  return seconds > 0 ? cueText(cue).replace(/\n/g, " ").length / seconds : Infinity;
}

/** Above this, a caption is widely considered too fast to read comfortably. */
export const COMFORTABLE_CPS = 21;

export const tooFastToRead = (cues: Cue[]): Cue[] => cues.filter((c) => charsPerSecond(c) > COMFORTABLE_CPS);
