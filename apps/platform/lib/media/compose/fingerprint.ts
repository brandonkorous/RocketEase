/*
 * "Is this render still current?" — as a comparison, not a guess.
 *
 * The fingerprint covers exactly what reaches pixels: resolved copy, resolved
 * hex, pixel geometry, the base image. Renaming a plan does not invalidate five
 * renders; changing a headline does. Changing the brand's primary swatch does
 * too, because the spec is resolved before it is hashed.
 */
import { createHash } from "node:crypto";
import type { BrandKit } from "@/lib/brand/types";
import type { Placement } from "@/lib/media/canvas/specs";
import type { AdPlan } from "@/lib/media/plan/types";
import { expandVariants } from "@/lib/media/plan/variants";
import { resolveRenderSpec, type RenderSpec } from "./spec";

/** Key order in JSON is insertion order, which a refactor can change. Sort it. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

/** Short enough to read in a log line, long enough that a collision is not a concern. */
export const fingerprint = (spec: RenderSpec): string =>
  createHash("sha256").update(stableStringify(spec)).digest("hex").slice(0, 32);

export const renderKey = (placement: Placement, variantId: string): string => `${placement}|${variantId}`;

/** Every (placement, variant) this plan currently describes, and its fingerprint. */
export function currentFingerprints(plan: AdPlan, kit: BrandKit | null): Map<string, string> {
  const out = new Map<string, string>();
  for (const variant of expandVariants(plan)) {
    if (variant.inert) continue;
    for (const placement of plan.placements) {
      out.set(renderKey(placement, variant.id), fingerprint(resolveRenderSpec({ variant, placement, kit })));
    }
  }
  return out;
}

export type RenderStatus = {
  placement: Placement;
  variantId: string;
  assetId: string | null;
  /** `current` — matches. `stale` — the plan moved on. `missing` — never rendered. */
  state: "current" | "stale" | "missing";
};

/** What a person needs to see next to a preview: which files still match the plan. */
export function renderStatuses(plan: AdPlan, kit: BrandKit | null): RenderStatus[] {
  const wanted = currentFingerprints(plan, kit);
  const byKey = new Map(plan.renders.map((r) => [renderKey(r.placement, r.variantId), r]));
  return [...wanted.entries()].map(([key, fp]) => {
    const [placement, variantId] = key.split("|") as [Placement, string];
    const record = byKey.get(key);
    if (!record) return { placement, variantId, assetId: null, state: "missing" as const };
    return { placement, variantId, assetId: record.assetId, state: record.fingerprint === fp ? ("current" as const) : ("stale" as const) };
  });
}

/** Renders left behind by a plan edit — a placement removed, a variant deleted. */
export function orphanedRenders(plan: AdPlan, kit: BrandKit | null): AdPlan["renders"] {
  const wanted = currentFingerprints(plan, kit);
  return plan.renders.filter((r) => !wanted.has(renderKey(r.placement, r.variantId)));
}
