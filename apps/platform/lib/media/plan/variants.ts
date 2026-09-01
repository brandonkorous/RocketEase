/*
 * Expanding a plan into the variants it actually renders.
 *
 * The rule that makes an A/B test mean anything: a variant differs from the
 * base on EXACTLY ONE axis. Never a cross product — a result from a creative
 * that changed both its hook and its CTA cannot be attributed to either.
 *
 * A variant whose axis has nothing to change is INERT and says so. Silently
 * rendering a second identical file is the failure this exists to prevent.
 */
import type { AdPlan, Overlay, Shot, VariantAxisKind } from "./types";
import { BASE_VARIANT_ID, VARIANT_AXIS_LABELS } from "./types";

export type PlanVariant = {
  id: string;
  label: string;
  /** null for the base. Otherwise the one respect in which this differs. */
  axis: VariantAxisKind | null;
  overlays: Overlay[];
  shots: Shot[];
  /** Set when the axis had nothing to act on — this variant would duplicate the base. */
  inert: string | null;
};

const firstTextIndex = (overlays: Overlay[], role: string) =>
  overlays.findIndex((o) => o.kind === "text" && o.role === role);

/** Swap one text overlay's copy, leaving every other field alone. */
function withText(overlays: Overlay[], role: string, text: string): Overlay[] | null {
  const i = firstTextIndex(overlays, role);
  if (i < 0) return null;
  const next = overlays.slice();
  next[i] = { ...(next[i] as Extract<Overlay, { kind: "text" }>), text };
  return next;
}

/** Swap the image the ad opens on, leaving the copy identical. */
function withOpeningAsset(shots: Shot[], assetId: string): Shot[] | null {
  if (!shots.length) return null;
  const next = shots.slice();
  next[0] = { ...next[0], assetId };
  return next;
}

type Applied = { overlays: Overlay[]; shots: Shot[]; inert: string | null };

function apply(plan: AdPlan, kind: VariantAxisKind, value: string): Applied {
  const base = { overlays: plan.overlays, shots: plan.shots };
  if (kind === "hook") {
    const overlays = withText(plan.overlays, "headline", value);
    return overlays ? { ...base, overlays, inert: null } : { ...base, inert: "this plan has no headline overlay to vary" };
  }
  if (kind === "cta") {
    const overlays = withText(plan.overlays, "cta", value);
    return overlays ? { ...base, overlays, inert: null } : { ...base, inert: "this plan has no call-to-action overlay to vary" };
  }
  const shots = withOpeningAsset(plan.shots, value);
  return shots ? { ...base, shots, inert: null } : { ...base, inert: "this plan has no shots, so there is no opening frame to swap" };
}

/** Trims before the ellipsis, so a cut at a word boundary reads "hook…" not "hook …". */
const truncate = (s: string, n = 32) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/**
 * Base first, then one variant per axis VALUE. Total is 1 + Σ values — linear
 * in the alternatives offered, never exponential in the axes.
 */
export function expandVariants(plan: AdPlan): PlanVariant[] {
  const out: PlanVariant[] = [
    { id: BASE_VARIANT_ID, label: "Base", axis: null, overlays: plan.overlays, shots: plan.shots, inert: null },
  ];

  for (const axis of plan.variants) {
    axis.values.forEach((value, i) => {
      const applied = apply(plan, axis.kind, value);
      const shown = axis.kind === "opening_frame" ? `image ${i + 1}` : truncate(value);
      out.push({
        id: `${axis.id}:${i}`,
        label: `${VARIANT_AXIS_LABELS[axis.kind]} — ${shown}`,
        axis: axis.kind,
        overlays: applied.overlays,
        shots: applied.shots,
        inert: applied.inert,
      });
    });
  }
  return out;
}

/** How many files a render pass would produce, and what it will skip. */
export function renderCount(plan: AdPlan): { renders: number; skipped: number } {
  const variants = expandVariants(plan);
  const live = variants.filter((v) => !v.inert).length;
  return { renders: live * plan.placements.length, skipped: (variants.length - live) * plan.placements.length };
}

export const variantById = (plan: AdPlan, id: string): PlanVariant | undefined =>
  expandVariants(plan).find((v) => v.id === id);

