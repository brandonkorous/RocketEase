/*
 * Judging a render that actually happened.
 *
 * This is the check the whole stage exists to make possible: because WE draw the
 * type, we know exactly where it landed, so "your CTA sits under the Reels UI"
 * is a computation. The renderer reports; this file decides.
 *
 * Every safe-zone number is currently unverified — reported consistently across
 * 2026 guides, published by nobody in a form we could read — so these warn and
 * say so, rather than blocking on somebody else's blog post.
 */
import { overflowFraction, violatedEdges } from "@/lib/media/canvas/geometry";
import { specFor } from "@/lib/media/canvas/specs";
import type { RenderResult } from "@/lib/media/compose/render";
import type { RenderSpec } from "@/lib/media/compose/spec";
import { error, warn, type CreativeIssue } from "./types";

const EDGE_LABELS = {
  top: "the top band, where the profile name and “Sponsored” label sit",
  bottom: "the bottom band, where the CTA and engagement icons sit",
  left: "the left margin",
  right: "the right rail, where the action buttons sit",
} as const;

/** Which overlay a person will recognise in a message. */
function nameOf(spec: RenderSpec, id: string): string {
  const text = spec.texts.find((t) => t.id === id);
  if (text) return `The ${text.role.replace("_", " ")} “${text.text.slice(0, 40)}”`;
  return "The logo";
}

function safeZoneIssues(spec: RenderSpec, result: RenderResult): CreativeIssue[] {
  const canvas = specFor(spec.placement);
  const severity = canvas.safeZoneVerified ? error : warn;
  return result.placed.flatMap((p) => {
    const edges = violatedEdges(p.rect, canvas);
    if (!edges.length) return [];
    const where = edges.map((e) => EDGE_LABELS[e]).join(", and ");
    return [
      severity(
        "safe_zone",
        `${nameOf(spec, p.id)} reaches into ${where} on ${canvas.label}. ${canvas.safeZoneNote}`,
        { placement: spec.placement, variantId: spec.variantId, overlayId: p.id },
      ),
    ];
  });
}

/** Type pushed off the canvas entirely is a hard failure, not a matter of taste. */
function overflowIssues(spec: RenderSpec, result: RenderResult): CreativeIssue[] {
  const full = { x: 0, y: 0, width: spec.canvas.width, height: spec.canvas.height };
  return result.placed.flatMap((p) => {
    const off = overflowFraction(p.rect, full);
    if (off <= 0.001) return [];
    return [
      error(
        "overlay_off_canvas",
        `${nameOf(spec, p.id)} is ${Math.round(off * 100)}% outside the canvas — it is too big for this placement at its current size.`,
        { placement: spec.placement, variantId: spec.variantId, overlayId: p.id },
      ),
    ];
  });
}

/** A silent font substitution is exactly the failure "probe, never believe" exists for. */
function fontIssues(spec: RenderSpec, result: RenderResult): CreativeIssue[] {
  const substituted = [...new Set(result.fonts.filter((f) => f.substituted).map((f) => f.requested))];
  return substituted.map((family) =>
    warn(
      "font_substituted",
      `The brand font “${family}” could not be confirmed in the render environment, so this image may use a substitute typeface.`,
      { placement: spec.placement, variantId: spec.variantId },
    ),
  );
}

const FINDING_SEVERITY: Record<string, "error" | "warning"> = {
  base_missing: "error",
  base_upscaled: "warning",
  logo_missing: "warning",
};

/** The renderer's own findings, promoted to issues with a severity. */
function findingIssues(spec: RenderSpec, result: RenderResult): CreativeIssue[] {
  return result.findings.map((f) =>
    (FINDING_SEVERITY[f.code] === "error" ? error : warn)(f.code, f.detail, {
      placement: spec.placement,
      variantId: spec.variantId,
    }),
  );
}

export function preflightRender(spec: RenderSpec, result: RenderResult): CreativeIssue[] {
  return [
    ...findingIssues(spec, result),
    ...overflowIssues(spec, result),
    ...safeZoneIssues(spec, result),
    ...fontIssues(spec, result),
  ];
}
