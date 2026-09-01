/*
 * What a concept card asks the model registry for. Kept out of image-assets.ts
 * so it is testable without pulling in `server-only`, storage and the database.
 */
import type { GenerationSpec } from "@rocketease/media";

export type ImageAspect = "square" | "portrait" | "landscape";
export type ImageOptions = { aspect: ImageAspect; count: number };

/** Hard cap on one request. A model that takes fewer is refused by routing. */
export const MAX_IMAGES = 4;

/** The composer's words → the aspect vocabulary the model registry speaks. */
const ASPECTS: Record<ImageAspect, string> = { square: "1:1", landscape: "3:2", portrait: "2:3" };

/**
 * A concept image is a `scene_still`: illustrative, nothing brand-critical.
 * Product fidelity and rendered type are different jobs with different models
 * (docs/media-models.md §3), and asking for either here would route wrongly.
 */
export function conceptImageSpec(prompt: string, opts: ImageOptions, altText: string | null): GenerationSpec {
  return {
    jobKind: "scene_still",
    prompt,
    aspect: ASPECTS[opts.aspect] ?? ASPECTS.square,
    count: Math.min(Math.max(1, opts.count), MAX_IMAGES),
    altText: altText ?? undefined,
  };
}
