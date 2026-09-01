/*
 * What to assemble, worked out before any ffmpeg runs.
 *
 * Pure timing and geometry. Getting this wrong is expensive in a way the render
 * itself is not: a mistimed cut is only visible after a multi-minute encode, so
 * the arithmetic is separated out and tested on its own.
 *
 * The canonical intermediate format matters more than it looks. Shots arrive
 * from different models at different frame rates, resolutions and pixel formats,
 * and the concat DEMUXER requires identical streams — so every shot is
 * normalised to the same canvas, fps, pixel format and audio layout first.
 * Skipping that step produces a file that plays for two seconds and then stops.
 */
import type { Size } from "@/lib/media/canvas/geometry";
import type { CanvasSpec } from "@/lib/media/canvas/specs";
import type { AudioPlan, Shot } from "@/lib/media/plan/types";
import { DEFAULT_AUDIO } from "@/lib/media/plan/types";

/** One shot, resolved to absolute timings on the finished timeline. */
export type AssemblyShot = {
  shotId: string;
  assetId: string;
  /** Where in the SOURCE clip to start. */
  trimStartMs: number;
  /** How long this shot runs on the timeline. */
  durationMs: number;
  /** Where on the timeline it begins. Derived, never stored. */
  offsetMs: number;
};

export type AssemblySpec = {
  canvas: Size;
  fps: number;
  shots: AssemblyShot[];
  totalMs: number;
  audio: AudioPlan;
  targetLufs: number;
};

/** 30fps: every network re-encodes anyway, and 60 doubles the bill for nothing. */
export const ASSEMBLY_FPS = 30;
/** The streaming loudness standard every social platform normalises toward. */
export const TARGET_LUFS = -14;
/** A shot with no stated length gets this. Long enough to read, short enough to cut. */
export const DEFAULT_SHOT_MS = 3000;

export type SourceDuration = (assetId: string) => number | null;

/**
 * Lay the shots out end to end. A shot's length is, in order: its explicit trim
 * duration; its stated `durationSeconds`; what is actually left in the source
 * after the trim; the default. Each step is a fact before the one after it is a
 * guess.
 */
export function layOutShots(shots: Shot[], sourceMs: SourceDuration): AssemblyShot[] {
  const out: AssemblyShot[] = [];
  let offsetMs = 0;

  for (const shot of shots) {
    if (!shot.assetId) continue;
    const trimStartMs = Math.max(0, shot.trimStartMs ?? 0);
    const available = sourceMs(shot.assetId);
    const remaining = available === null ? null : Math.max(0, available - trimStartMs);

    const wanted =
      shot.trimDurationMs ??
      (shot.durationSeconds ? shot.durationSeconds * 1000 : null) ??
      remaining ??
      DEFAULT_SHOT_MS;

    // Never ask for more than the source has: ffmpeg would silently hold the
    // last frame, which reads as a freeze rather than as an error.
    const durationMs = Math.round(remaining === null ? wanted : Math.min(wanted, remaining));
    if (durationMs <= 0) continue;

    out.push({ shotId: shot.id, assetId: shot.assetId, trimStartMs, durationMs, offsetMs });
    offsetMs += durationMs;
  }
  return out;
}

export type BuildSpecInput = {
  shots: Shot[];
  canvasSpec: CanvasSpec;
  audio?: AudioPlan;
  sourceMs: SourceDuration;
};

export function buildAssemblySpec(input: BuildSpecInput): AssemblySpec {
  const shots = layOutShots(input.shots, input.sourceMs);
  return {
    canvas: { width: input.canvasSpec.width, height: input.canvasSpec.height },
    fps: ASSEMBLY_FPS,
    shots,
    totalMs: shots.reduce((sum, s) => sum + s.durationMs, 0),
    audio: input.audio ?? DEFAULT_AUDIO,
    targetLufs: TARGET_LUFS,
  };
}

export type DurationIssue = { code: string; message: string };

/**
 * Length against the placement's own bounds, plus the rule that actually decides
 * whether anyone watches: the first three seconds. ~71% of whether a viewer
 * keeps watching is settled there (docs/research/ai-media-2026.md §6), so a
 * first shot longer than that is a real finding, not pedantry.
 */
export function durationIssues(spec: AssemblySpec, canvas: CanvasSpec): DurationIssue[] {
  const out: DurationIssue[] = [];
  const seconds = spec.totalMs / 1000;
  const bounds = canvas.durationSeconds;

  if (!spec.shots.length) {
    out.push({ code: "no_shots", message: "This plan has no clips attached, so there is nothing to assemble." });
    return out;
  }
  if (bounds && seconds < bounds.min) {
    out.push({ code: "too_short", message: `${canvas.label} needs at least ${bounds.min}s and this cut is ${seconds.toFixed(1)}s.` });
  }
  if (bounds && seconds > bounds.max) {
    out.push({ code: "too_long", message: `${canvas.label} allows at most ${bounds.max}s and this cut is ${seconds.toFixed(1)}s.` });
  }
  if (spec.shots[0].durationMs > 3000) {
    out.push({
      code: "slow_hook",
      message: `The first shot runs ${(spec.shots[0].durationMs / 1000).toFixed(1)}s. Most of whether a viewer keeps watching is decided in the first 3 seconds.`,
    });
  }
  return out;
}
