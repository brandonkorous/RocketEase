/*
 * The AdPlan — a plan, not a picture.
 *
 * The model's job is to write THIS, not to draw. A plan is JSON a person can
 * read, argue with and edit, and re-rendering it costs a composite rather than
 * a generation (docs/media-generation.md §3.1).
 *
 * Two consequences the rest of the stage depends on:
 *   - Copy edits are free. Changing a headline re-runs sharp, not a $12 render.
 *   - Variants differ on ONE stated axis, so an A/B test means something.
 *
 * Pure and client-safe: no database, no image library, no keys.
 */
import type { JobKind } from "@rocketease/media";
import type { Goal } from "@/lib/ai/generator/types";
import type { LogoRole, SwatchRole } from "@/lib/brand/types";
import type { Anchor } from "@/lib/media/canvas/geometry";
import type { Placement } from "@/lib/media/canvas/specs";

export const PLAN_VERSION = 1;

/** What a line of type is FOR. Decides default size, weight and anchor. */
export const TEXT_ROLES = ["headline", "subhead", "price", "cta", "legal"] as const;
export type TextRole = (typeof TEXT_ROLES)[number];

export const TEXT_ROLE_LABELS: Record<TextRole, string> = {
  headline: "Headline",
  subhead: "Subhead",
  price: "Price",
  cta: "Call to action",
  legal: "Legal line",
};

/** Type is bound to the brand kit by ROLE. A raw hex is an override, not the norm. */
export type TextStyle = {
  /** Which brand family to ask for. The renderer records any substitution. */
  family: "heading" | "body";
  /** Cap height as a fraction of the canvas's short edge. 0.08 ≈ 86px on 1080. */
  sizeFraction: number;
  weight: "regular" | "medium" | "bold";
  align: "left" | "center" | "right";
  /** A swatch role resolved from the brand kit's palette… */
  colorRole: SwatchRole;
  /** …unless a hex is given, which wins. */
  colorHex?: string;
  /** Legibility over busy imagery. `scrim` is a soft gradient, `box` a solid plate. */
  backdrop: "none" | "scrim" | "box";
  /** Longest line, as a fraction of the safe area's width. */
  maxWidthFraction: number;
};

export type TextOverlay = {
  id: string;
  kind: "text";
  role: TextRole;
  text: string;
  anchor: Anchor;
  style: TextStyle;
};

export type LogoOverlay = {
  id: string;
  kind: "logo";
  /** Which of the brand kit's 8 logo variants to draw. */
  logoRole: LogoRole;
  anchor: Anchor;
  /** Logo width as a fraction of the safe area's width. */
  widthFraction: number;
};

export type Overlay = TextOverlay | LogoOverlay;

/** One generated or uploaded image or clip. */
export type Shot = {
  id: string;
  jobKind: JobKind;
  /** What the model is told to make. Never contains the price or the CTA — those are composited. */
  direction: string;
  durationSeconds?: number;
  /** Real packshots and style references, by asset id. Product first, always. */
  references: { product: string[]; style: string[]; talent: string[] };
  /** The asset this shot resolved to — generated, or an upload a person picked. */
  assetId?: string;
  /** Video only: where in the source clip this shot starts, and how long it runs. */
  trimStartMs?: number;
  trimDurationMs?: number;
};

/**
 * The audio bed (12.4). Asset ids, not files: a voice-over is a library asset
 * with its own rights and consent scope, and the preflight already checks both.
 */
export type AudioPlan = {
  voiceoverAssetId?: string;
  musicAssetId?: string;
  /**
   * How far the bed drops while the voice speaks. Ducking is what makes a
   * voice-over intelligible over music; without it people just turn it off.
   */
  duckDb: number;
  musicGainDb: number;
};

export const DEFAULT_AUDIO: AudioPlan = { duckDb: 12, musicGainDb: -18 };

/** Burned in by default: social video autoplays muted and no sidecar travels. */
export type CaptionPlan = { burnIn: boolean; language: string };

export const DEFAULT_CAPTIONS: CaptionPlan = { burnIn: true, language: "en" };

/**
 * One axis of deliberate difference. Each value becomes ONE variant that differs
 * from the base in exactly this respect — never a cross product, because a test
 * across two axes at once cannot attribute the result to either.
 */
export const VARIANT_AXES = ["hook", "cta", "opening_frame"] as const;
export type VariantAxisKind = (typeof VARIANT_AXES)[number];

export const VARIANT_AXIS_LABELS: Record<VariantAxisKind, string> = {
  hook: "Hook",
  cta: "Call to action",
  opening_frame: "Opening frame",
};

export type VariantAxis = {
  id: string;
  kind: VariantAxisKind;
  /** Alternatives to the base. Text for hook/cta; an asset id for opening_frame. */
  values: string[];
};

/** A render that happened, stamped with the plan state that produced it. */
export type RenderRecord = {
  placement: Placement;
  variantId: string;
  assetId: string;
  /** Of the inputs that reach pixels. Differs from the plan's current one ⇒ stale. */
  fingerprint: string;
  renderedAt: string;
};

export type AdPlan = {
  version: number;
  objective: Goal;
  /** A one-line statement of what this ad is for. The person's words or the model's draft. */
  title: string;
  placements: Placement[];
  /** On screen from the first frame. Non-negotiable in the first 3 seconds for video. */
  hook: string;
  shots: Shot[];
  overlays: Overlay[];
  variants: VariantAxis[];
  renders: RenderRecord[];
  /** Video only. Absent on a static plan, which is most of them. */
  audio?: AudioPlan;
  captions?: CaptionPlan;
};

export const BASE_VARIANT_ID = "base";

/** Sensible starting type, so a plan is renderable before anyone tunes it. */
export const DEFAULT_STYLE: Record<TextRole, TextStyle> = {
  headline: { family: "heading", sizeFraction: 0.085, weight: "bold", align: "left", colorRole: "text", backdrop: "scrim", maxWidthFraction: 1 },
  subhead: { family: "body", sizeFraction: 0.045, weight: "regular", align: "left", colorRole: "text", backdrop: "scrim", maxWidthFraction: 0.9 },
  price: { family: "heading", sizeFraction: 0.07, weight: "bold", align: "left", colorRole: "primary", backdrop: "box", maxWidthFraction: 0.6 },
  cta: { family: "body", sizeFraction: 0.04, weight: "medium", align: "center", colorRole: "surface", backdrop: "box", maxWidthFraction: 0.7 },
  legal: { family: "body", sizeFraction: 0.018, weight: "regular", align: "left", colorRole: "text", backdrop: "none", maxWidthFraction: 1 },
};

export const DEFAULT_ANCHOR: Record<TextRole, Anchor> = {
  headline: "middle_center",
  subhead: "middle_center",
  price: "top_left",
  cta: "bottom_center",
  legal: "bottom_left",
};
