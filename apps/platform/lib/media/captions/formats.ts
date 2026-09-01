/*
 * The sidecar formats. SRT and WebVTT.
 *
 * Almost no network accepts a caption sidecar over its API — YouTube does;
 * Instagram, TikTok and LinkedIn do not (docs/research/ai-media-2026.md §10).
 * So the sidecar is for YouTube, for accessibility, and for the archive, while
 * the pixels carry the captions everywhere else. Both matter; neither replaces
 * the other.
 *
 * Pure string work, and reversible: `parseSrt`/`parseVtt` exist so a serialiser
 * bug shows up as a failed round trip rather than as a broken file on YouTube.
 */
import type { Cue } from "./cues";
import { cueText } from "./cues";

const pad = (n: number, width = 2) => String(Math.floor(n)).padStart(width, "0");

function parts(ms: number) {
  const clamped = Math.max(0, Math.round(ms));
  return {
    h: Math.floor(clamped / 3_600_000),
    m: Math.floor(clamped / 60_000) % 60,
    s: Math.floor(clamped / 1000) % 60,
    ms: clamped % 1000,
  };
}

/** `00:00:01,500` — SRT uses a COMMA before the milliseconds. */
export function srtTime(ms: number): string {
  const p = parts(ms);
  return `${pad(p.h)}:${pad(p.m)}:${pad(p.s)},${pad(p.ms, 3)}`;
}

/** `00:00:01.500` — WebVTT uses a full stop. Getting this wrong breaks silently. */
export function vttTime(ms: number): string {
  const p = parts(ms);
  return `${pad(p.h)}:${pad(p.m)}:${pad(p.s)}.${pad(p.ms, 3)}`;
}

export function toSrt(cues: Cue[]): string {
  return cues
    .map((c, i) => `${i + 1}\n${srtTime(c.startMs)} --> ${srtTime(c.endMs)}\n${cueText(c)}\n`)
    .join("\n");
}

export function toVtt(cues: Cue[]): string {
  const body = cues.map((c) => `${vttTime(c.startMs)} --> ${vttTime(c.endMs)}\n${cueText(c)}\n`).join("\n");
  return `WEBVTT\n\n${body}`;
}

const TIME = /(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})/;

/** Milliseconds from either dialect's timestamp, or null when it is not one. */
export function parseTime(value: string): number | null {
  const m = TIME.exec(value.trim());
  if (!m) return null;
  const frac = m[4].padEnd(3, "0");
  return Number(m[1]) * 3_600_000 + Number(m[2]) * 60_000 + Number(m[3]) * 1000 + Number(frac);
}

/**
 * Parse either dialect. Blocks are separated by a blank line; a leading numeric
 * index (SRT) and a WEBVTT header are both tolerated, and anything unparseable
 * is skipped rather than throwing — a malformed sidecar should cost the bad cue,
 * not the whole file.
 */
export function parseCues(text: string): Cue[] {
  const blocks = text.replace(/\r\n?/g, "\n").replace(/^WEBVTT[^\n]*\n/, "").split(/\n{2,}/);
  const cues: Cue[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim().length > 0);
    if (!lines.length) continue;
    // An SRT block opens with its index; a VTT block may open with a cue id.
    const arrowAt = lines.findIndex((l) => l.includes("-->"));
    if (arrowAt < 0) continue;
    const [from, to] = lines[arrowAt].split("-->");
    const startMs = parseTime(from ?? "");
    const endMs = parseTime(to ?? "");
    if (startMs === null || endMs === null) continue;
    const body = lines.slice(arrowAt + 1);
    if (!body.length) continue;
    cues.push({ startMs, endMs, lines: body });
  }
  return cues;
}

export const parseSrt = parseCues;
export const parseVtt = parseCues;

export type SidecarFormat = "srt" | "vtt";

export const SIDECAR: Record<SidecarFormat, { mimeType: string; extension: string; render: (c: Cue[]) => string }> = {
  srt: { mimeType: "application/x-subrip", extension: ".srt", render: toSrt },
  vtt: { mimeType: "text/vtt", extension: ".vtt", render: toVtt },
};
