/*
 * Target length → shot segments (M12.6 orchestration).
 *
 * The person chooses a REAL content length (15–30s); the model renders 5s or
 * 10s takes. Orchestration is the difference: we plan the takes, the person
 * directs each one, assembly joins them into one video. Nothing here talks to
 * a vendor — it is arithmetic over what the routed model's io declares.
 *
 * Segments are PLAN lengths and sum exactly to the target: a 22s ask becomes
 * [10, 10, 2], and the 2s shot is generated as a 5s take and trimmed —
 * generation rounds up (shot-spec.ts), the plan does not lie about length.
 */
import type { AdPlan, Shot } from "./types";
import { overlayId } from "./starter";

/** Shots a plan may carry (mirrors the schema's max). */
const MAX_SHOTS = 8;

/** Largest-first segments that sum exactly to `target`, from allowed take lengths. */
export function planShotDurations(target: number, allowed: number[]): number[] | { error: string } {
  const sizes = [...new Set(allowed)].filter((n) => Number.isInteger(n) && n > 0).sort((a, b) => b - a);
  if (sizes.length === 0) return { error: "The routed model declares no durations to plan with." };
  const chunk = sizes[0];
  const segments: number[] = [];
  let remaining = target;
  while (remaining > 0 && segments.length < MAX_SHOTS) {
    // Prefer full chunks; give the remainder its own short shot (trimmed from
    // the shortest take that covers it) rather than stretching anything.
    const next = remaining >= chunk ? chunk : remaining;
    segments.push(next);
    remaining -= next;
  }
  if (remaining > 0) return { error: `${target}s needs more than ${MAX_SHOTS} shots — pick a shorter length.` };
  return segments;
}

/**
 * The plan's shots, reshaped to the segments. Existing shots keep their
 * direction, references and adopted takes (order preserved); new shots are
 * added with the last shot's job kind and references, so a person extends a
 * sequence rather than starting over. Shots past the segment count are
 * dropped — the person pressed the shorter button, and the other button
 * brings the count straight back.
 */
export function reshapeShots(plan: AdPlan, segments: number[]): Shot[] {
  const template = plan.shots[plan.shots.length - 1];
  return segments.map((durationSeconds, i) => {
    const existing = plan.shots[i];
    if (existing) return { ...existing, durationSeconds };
    return {
      id: overlayId("shot"),
      jobKind: template?.jobKind ?? "hero_shot",
      direction: "",
      references: template ? { ...template.references } : { product: [], style: [], talent: [] },
      durationSeconds,
    };
  });
}

/** The plan's current video length — what the length buttons highlight. */
export const plannedSeconds = (plan: AdPlan): number => plan.shots.reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0);
