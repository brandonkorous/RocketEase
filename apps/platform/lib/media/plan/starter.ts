/*
 * A plan that renders on the first click.
 *
 * The alternative — an empty plan a person has to assemble before seeing
 * anything — makes the first experience of the feature a form. So a starter
 * carries a headline, a CTA and one shot, all editable, none invented: every
 * string here comes from the person's brief or the brand kit, never the model.
 */
import type { BrandKit } from "@/lib/brand/types";
import type { Placement } from "@/lib/media/canvas/specs";
import type { Goal } from "@/lib/ai/generator/types";
import { DEFAULT_ANCHOR, DEFAULT_STYLE, PLAN_VERSION, type AdPlan, type Overlay, type TextRole } from "./types";

let counter = 0;
/** Stable within a plan, unique within a process. Ids only need to be local. */
export const overlayId = (role: string): string => `${role}-${(counter = (counter + 1) % 100000).toString(36)}`;

export function textOverlay(role: TextRole, text: string): Overlay {
  return { id: overlayId(role), kind: "text", role, text, anchor: DEFAULT_ANCHOR[role], style: { ...DEFAULT_STYLE[role] } };
}

export type StarterInput = {
  objective: Goal;
  title: string;
  placements: Placement[];
  headline: string;
  cta?: string;
  /** The person's words, never the model's. Rendered as the legal line. */
  legal?: string;
  /** A library asset to build on. Without one the ad renders on a flat brand colour. */
  assetId?: string;
  kit?: BrandKit | null;
};

/** The brand's own logo, only if the kit actually has one — never a placeholder. */
function logoOverlay(kit: BrandKit | null | undefined): Overlay[] {
  const role = kit?.visual?.logos?.find((l) => l.role === "mono_light" || l.role === "primary")?.role;
  return role ? [{ id: overlayId("logo"), kind: "logo", logoRole: role, anchor: "top_left", widthFraction: 0.28 }] : [];
}

export function starterPlan(input: StarterInput): AdPlan {
  const overlays: Overlay[] = [
    ...logoOverlay(input.kit),
    textOverlay("headline", input.headline),
    ...(input.cta ? [textOverlay("cta", input.cta)] : []),
    ...(input.legal ? [textOverlay("legal", input.legal)] : []),
  ];
  return {
    version: PLAN_VERSION,
    objective: input.objective,
    title: input.title,
    placements: input.placements,
    hook: input.headline,
    shots: [
      {
        id: overlayId("shot"),
        jobKind: "scene_still",
        direction: "",
        references: { product: [], style: [], talent: [] },
        assetId: input.assetId,
      },
    ],
    overlays,
    variants: [],
    renders: [],
  };
}
