/*
 * Parsing ffprobe's JSON — pure, so the shapes real files produce are testable
 * without ffprobe installed.
 *
 * ffprobe reports numbers as strings, durations on either the format or the
 * stream, and frame rates as fractions like "30000/1001". Every one of those is
 * a chance to record a confident wrong number, so each is parsed explicitly and
 * an unreadable value becomes null rather than 0.
 */

export type Probe = {
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  hasAudio: boolean;
  hasVideo: boolean;
  bitrate: number | null;
};

export const EMPTY_PROBE: Probe = {
  durationSeconds: null,
  width: null,
  height: null,
  fps: null,
  videoCodec: null,
  audioCodec: null,
  hasAudio: false,
  hasVideo: false,
  bitrate: null,
};

type RawStream = {
  codec_type?: string;
  codec_name?: string;
  width?: number | string;
  height?: number | string;
  duration?: string;
  avg_frame_rate?: string;
  r_frame_rate?: string;
};
type RawProbe = { format?: { duration?: string; bit_rate?: string }; streams?: RawStream[] };

/** A finite positive number, or null. Never NaN, never a negative masquerading as a value. */
export function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** "30000/1001" → 29.97. A zero denominator is unknown, not Infinity. */
export function parseFrameRate(value: string | undefined): number | null {
  if (!value) return null;
  const [a, b] = value.split("/");
  const top = num(a);
  const bottom = b === undefined ? 1 : num(b);
  if (top === null || bottom === null || bottom === 0) return null;
  return Math.round((top / bottom) * 1000) / 1000;
}

/** Parse `ffprobe -print_format json -show_format -show_streams` output. */
export function parseProbe(json: string): Probe {
  let raw: RawProbe;
  try {
    raw = JSON.parse(json) as RawProbe;
  } catch {
    return EMPTY_PROBE;
  }

  const streams = Array.isArray(raw.streams) ? raw.streams : [];
  const video = streams.find((s) => s.codec_type === "video");
  const audio = streams.find((s) => s.codec_type === "audio");

  // Container duration is the honest one; fall back to a stream's own.
  const duration = num(raw.format?.duration) ?? num(video?.duration) ?? num(audio?.duration);

  return {
    durationSeconds: duration,
    width: num(video?.width),
    height: num(video?.height),
    fps: parseFrameRate(video?.avg_frame_rate) ?? parseFrameRate(video?.r_frame_rate),
    videoCodec: video?.codec_name ?? null,
    audioCodec: audio?.codec_name ?? null,
    hasAudio: Boolean(audio),
    hasVideo: Boolean(video),
    bitrate: num(raw.format?.bit_rate),
  };
}

/** Whole seconds for the `asset.duration_seconds` column; null stays null. */
export const wholeSeconds = (d: number | null): number | null => (d === null ? null : Math.round(d));

/**
 * Where a vendor's claim and the file disagree, in words a person can act on.
 * Kept rather than hidden: a model that says 8s and delivers 7.4s will fail a
 * network's duration rule later, and this is where that becomes visible.
 */
export function mismatches(
  probe: Probe,
  claimed: { durationSeconds?: number; width?: number; height?: number },
  toleranceSeconds = 0.5,
): string[] {
  const out: string[] = [];
  if (claimed.durationSeconds != null && probe.durationSeconds != null) {
    const delta = Math.abs(claimed.durationSeconds - probe.durationSeconds);
    if (delta > toleranceSeconds) out.push(`duration: claimed ${claimed.durationSeconds}s, file is ${probe.durationSeconds}s`);
  }
  if (claimed.width != null && probe.width != null && claimed.width !== probe.width) {
    out.push(`width: claimed ${claimed.width}, file is ${probe.width}`);
  }
  if (claimed.height != null && probe.height != null && claimed.height !== probe.height) {
    out.push(`height: claimed ${claimed.height}, file is ${probe.height}`);
  }
  return out;
}
