/*
 * What a concept card asks the model registry for. Kept out of image-assets.ts
 * so it is testable without pulling in `server-only`, storage and the database.
 */
import type { GenerationSpec } from "@rocketease/media";

export type ImageAspect = "square" | "portrait" | "landscape";
export type ImageOptions = { aspect: ImageAspect; count: number };

/** Hard cap on one request. A model that takes fewer is refused by routing. */
export const MAX_IMAGES = 4;

/**
 * The composer's words → aspects we ACTUALLY PUBLISH AT. Every placement in
 * lib/media/canvas/specs.ts is mobile: three at 9:16 (Reels/Stories, TikTok
 * in-feed, YouTube Shorts), two at 1:1 (Meta and LinkedIn feed), one at 4:5.
 * NOTHING ships at 3:2 or 2:3, so generating there produced an image that fit
 * no placement it would ever be used in.
 */
const ASPECTS: Record<ImageAspect, string> = { square: "1:1", portrait: "9:16", landscape: "16:9" };

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
