/*
 * AdPlan validation. A plan arrives from an LLM, from a form, or out of a jsonb
 * column written by an older build — none of which are trustworthy, all of which
 * end up driving a renderer that draws a client's price on a paid ad.
 *
 * So: parse, never assume. Unknown fields are dropped rather than carried.
 */
import { z } from "zod";
import { JOB_KINDS } from "@rocketease/media";
import { GOALS } from "@/lib/ai/generator/types";
import { LOGO_ROLES, SWATCH_ROLES } from "@/lib/brand/types";
import { ANCHORS } from "@/lib/media/canvas/geometry";
import { PLACEMENTS } from "@/lib/media/canvas/specs";
import { PLAN_VERSION, TEXT_ROLES, VARIANT_AXES, type AdPlan } from "./types";

const id = z.string().trim().min(1).max(64);
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a six-digit hex colour.");

const styleSchema = z.object({
  family: z.enum(["heading", "body"]).default("body"),
  sizeFraction: z.number().min(0.005).max(0.5),
  weight: z.enum(["regular", "medium", "bold"]).default("regular"),
  align: z.enum(["left", "center", "right"]).default("left"),
  colorRole: z.enum(SWATCH_ROLES).default("text"),
  colorHex: hex.optional(),
  backdrop: z.enum(["none", "scrim", "box"]).default("none"),
  maxWidthFraction: z.number().min(0.1).max(1).default(1),
});

const textOverlay = z.object({
  id,
  kind: z.literal("text"),
  role: z.enum(TEXT_ROLES),
  // Empty text is legal on the way in — a person clears a field mid-edit. The
  // renderer skips it and the preflight says the overlay is empty.
  text: z.string().max(400),
  anchor: z.enum(ANCHORS),
  style: styleSchema,
});

const logoOverlay = z.object({
  id,
  kind: z.literal("logo"),
  logoRole: z.enum(LOGO_ROLES),
  anchor: z.enum(ANCHORS),
  widthFraction: z.number().min(0.02).max(1),
});

const overlaySchema = z.discriminatedUnion("kind", [textOverlay, logoOverlay]);

const shotSchema = z.object({
  id,
  jobKind: z.enum(JOB_KINDS),
  direction: z.string().trim().max(2000),
  durationSeconds: z.number().int().min(1).max(300).optional(),
  references: z
    .object({
      product: z.array(id).max(12).default([]),
      style: z.array(id).max(12).default([]),
      talent: z.array(id).max(12).default([]),
    })
    .default({ product: [], style: [], talent: [] }),
  assetId: id.optional(),
  trimStartMs: z.number().int().min(0).max(3_600_000).optional(),
  trimDurationMs: z.number().int().min(100).max(600_000).optional(),
});

const audioSchema = z.object({
  voiceoverAssetId: id.optional(),
  musicAssetId: id.optional(),
  duckDb: z.number().min(0).max(40).default(12),
  musicGainDb: z.number().min(-60).max(12).default(-18),
});

const captionPlanSchema = z.object({
  burnIn: z.boolean().default(true),
  language: z.string().trim().min(1).max(20).default("en"),
});

const variantAxisSchema = z.object({
  id,
  kind: z.enum(VARIANT_AXES),
  values: z.array(z.string().trim().min(1).max(400)).max(4).default([]),
});

const renderSchema = z.object({
  placement: z.enum(PLACEMENTS),
  variantId: id,
  assetId: id,
  fingerprint: z.string().min(1).max(128),
  renderedAt: z.string(),
});

const acceptanceSchema = z.object({
  placement: z.enum(PLACEMENTS),
  fingerprint: z.string().min(1).max(128),
  acceptedAt: z.string(),
  acceptedByUserId: z.string().min(1).max(64),
});

export const adPlanSchema = z.object({
  version: z.number().int().default(PLAN_VERSION),
  objective: z.enum(GOALS),
  title: z.string().trim().min(1).max(200),
  placements: z.array(z.enum(PLACEMENTS)).min(1).max(PLACEMENTS.length),
  hook: z.string().trim().max(400).default(""),
  shots: z.array(shotSchema).max(8).default([]),
  overlays: z.array(overlaySchema).max(12).default([]),
  variants: z.array(variantAxisSchema).max(4).default([]),
  renders: z.array(renderSchema).max(200).default([]),
  // Defaulted, so every plan written before M12.6 reads back as unaccepted —
  // which is true: nobody accepted anything through a gate that didn't exist.
  acceptances: z.array(acceptanceSchema).max(20).default([]),
  audio: audioSchema.optional(),
  captions: captionPlanSchema.optional(),
});

export type AdPlanInput = z.input<typeof adPlanSchema>;

/** Parsed or null — never a half-valid plan. The caller reports the reason. */
export function parsePlan(value: unknown): { plan: AdPlan } | { error: string } {
  const result = adPlanSchema.safeParse(value);
  if (!result.success) {
    const first = result.error.issues[0];
    return { error: first ? `${first.path.join(".") || "plan"}: ${first.message}` : "This plan could not be read." };
  }
  return { plan: result.data as AdPlan };
}

/** A row read back from jsonb. Unreadable plans are dropped, never half-applied. */
export const readPlan = (value: unknown): AdPlan | null => {
  if (!value) return null;
  const parsed = parsePlan(value);
  return "plan" in parsed ? parsed.plan : null;
};
