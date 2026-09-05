/*
 * Shot → GenerationSpec (M12.6 WP4).
 *
 * A shot in a plan is a stated intent — job kind, direction, references,
 * timing. Regenerating it means turning that intent into the same spec shape
 * every other generation uses, so routing, the estimate, the ceiling and the
 * consent gate all apply unchanged. Pure: the actions layer owns sessions and
 * spend.
 */
import type { GenerationSpec, ModelIO } from "@rocketease/media";
import { CANVAS_SPECS, type Placement } from "@/lib/media/canvas/specs";
import type { AdPlan, Shot } from "./types";

/**
 * The duration to GENERATE for a shot of `asked` seconds — rounded UP to what
 * the model accepts, never down: assembly trims a long take to the shot's
 * length, but no cut makes a short take longer. Null for models with no
 * duration at all (stills).
 */
export function generationSeconds(io: ModelIO, asked: number): number | null {
  const d = io.outputs.duration;
  if (!d) return null;
  if (d.allowed?.length) {
    const sorted = [...d.allowed].sort((a, b) => a - b);
    return sorted.find((v) => v >= asked) ?? sorted[sorted.length - 1];
  }
  return Math.min(Math.max(asked, d.min), d.max);
}

/**
 * The one aspect a shot is generated at. Shots render across every placement
 * by cropping, so the pick is the coverage argument, not a preference: a
 * vertical master crops down to square acceptably; a square never becomes a
 * Reel. Portrait wins whenever any placement is portrait.
 */
export function shotAspect(placements: Placement[]): "9:16" | "1:1" | "16:9" {
  const specs = placements.map((p) => CANVAS_SPECS[p]);
  if (specs.some((s) => s.height / s.width >= 1.5)) return "9:16";
  if (specs.some((s) => s.height >= s.width)) return "1:1";
  return "16:9";
}

/** The references, product first — the same fixed order the resolver applies. */
function shotReferences(shot: Shot): GenerationSpec["references"] {
  const refs = [
    ...shot.references.product.map((assetId) => ({ assetId, role: "product" as const })),
    ...shot.references.style.map((assetId) => ({ assetId, role: "style" as const })),
    ...shot.references.talent.map((assetId) => ({ assetId, role: "talent" as const })),
  ];
  return refs.length ? refs : undefined;
}

/**
 * The spec this shot's regeneration submits. `durationSeconds` is the SHOT's
 * timing; the caller rounds it to what the routed model accepts and says so —
 * a 3-second shot is cut from a 5-second take, not refused.
 */
export function shotSpec(plan: AdPlan, shot: Shot): GenerationSpec {
  return {
    jobKind: shot.jobKind,
    prompt: shot.direction,
    aspect: shotAspect(plan.placements),
    count: 1,
    ...(shot.durationSeconds !== undefined ? { durationSeconds: shot.durationSeconds } : {}),
    ...(shotReferences(shot) ? { references: shotReferences(shot) } : {}),
  };
}
