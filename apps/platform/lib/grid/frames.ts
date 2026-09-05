/*
 * Where candidate cover frames are taken from a clip. Pure, so the worker's
 * choice of stills is testable without ffmpeg.
 */
export const DEFAULT_FRAME_COUNT = 6;
export const MAX_FRAME_COUNT = 12;

/**
 * Evenly spaced offsets in milliseconds between 5% and 95% of the clip — the
 * first and last frames are usually black or a fade. A clip whose length is
 * unknown yields the first frame only, never a guess past its end.
 */
export function frameOffsets(durationSeconds: number | null | undefined, count = DEFAULT_FRAME_COUNT): number[] {
  const n = Math.min(MAX_FRAME_COUNT, Math.max(1, Math.round(count)));
  if (!durationSeconds || durationSeconds <= 0) return [0];
  const lo = durationSeconds * 0.05;
  const hi = durationSeconds * 0.95;
  if (n === 1) return [Math.round(lo * 1000)];
  return Array.from({ length: n }, (_, i) => Math.round((lo + ((hi - lo) * i) / (n - 1)) * 1000));
}
