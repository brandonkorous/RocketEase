/*
 * Plan variant + brand kit + canvas → a RenderSpec.
 *
 * The RenderSpec is the whole point of the "composite type, never diffuse it"
 * rule made concrete: real strings, real hex values from the brand palette, real
 * pixel geometry. Nothing here is approximate, and nothing here asks a model.
 *
 * It is also what gets fingerprinted, so this resolution must be PURE — same
 * plan and same kit in, byte-identical spec out.
 */
import type { BrandKit, SwatchRole } from "@/lib/brand/types";
import { gutter as gutterOf, safeRect, type Anchor, type Rect, type Size } from "@/lib/media/canvas/geometry";
import { specFor, type CanvasSpec, type Placement } from "@/lib/media/canvas/specs";
import { assetLocator, type MediaLocator } from "@/lib/media/locator";
import { brandLogoLocator } from "@/lib/media/references";
import type { PlanVariant } from "@/lib/media/plan/variants";
import type { TextRole } from "@/lib/media/plan/types";

export type ResolvedTextLayer = {
  id: string;
  role: TextRole;
  text: string;
  anchor: Anchor;
  align: "left" | "center" | "right";
  /** What the brand kit asked for. Empty means "no preference" — never a warning. */
  fontFamily: string;
  fontWeight: "regular" | "medium" | "bold";
  fontSizePx: number;
  colorHex: string;
  backdrop: "none" | "scrim" | "box";
  backdropHex: string;
  maxWidthPx: number;
};

export type ResolvedLogoLayer = { id: string; locator: MediaLocator; anchor: Anchor; boxWidthPx: number };

export type RenderSpec = {
  placement: Placement;
  variantId: string;
  canvas: Size;
  safe: Rect;
  gutter: number;
  /** The imagery underneath. Null renders the brand's surface colour instead. */
  base: MediaLocator | null;
  backgroundHex: string;
  texts: ResolvedTextLayer[];
  logos: ResolvedLogoLayer[];
};

/** Monochrome defaults, per design.md. A kit with no palette still renders correctly. */
const FALLBACK: Record<SwatchRole, string> = {
  primary: "#0a0a0a",
  secondary: "#404040",
  accent: "#0a0a0a",
  neutral: "#737373",
  surface: "#ffffff",
  text: "#0a0a0a",
};

/**
 * The brand kit accepts `#fff` as well as `#ffffff` (lib/brand/read.ts), so a
 * three-digit swatch must EXPAND here. Rejecting it would silently redraw a
 * brand colour as the monochrome default.
 */
const normalizeHex = (hex: string): string | null => {
  const v = hex.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  return null;
};

export function swatch(kit: BrandKit | null, role: SwatchRole): string {
  const found = kit?.visual?.palette?.find((s) => s.role === role)?.hex;
  return (found && normalizeHex(found)) || FALLBACK[role];
}

/** WCAG relative luminance. Decides which plate colour keeps type legible. */
export function luminance(hex: string): number {
  const v = normalizeHex(hex) ?? "#000000";
  const chan = (i: number) => {
    const c = parseInt(v.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan(0) + 0.7152 * chan(1) + 0.0722 * chan(2);
}

/** A plate behind the type, in whichever brand colour actually contrasts with it. */
function plateFor(kit: BrandKit | null, textHex: string): string {
  const light = swatch(kit, "surface");
  const dark = swatch(kit, "primary");
  const textIsLight = luminance(textHex) > 0.5;
  const candidate = textIsLight ? dark : light;
  // If the brand's own pair has no contrast, fall back to monochrome rather than
  // drawing invisible type in the brand's colours.
  return Math.abs(luminance(candidate) - luminance(textHex)) > 0.2 ? candidate : textIsLight ? "#0a0a0a" : "#ffffff";
}

const familyFor = (kit: BrandKit | null, family: "heading" | "body"): string =>
  (family === "heading" ? kit?.visual?.typography?.headingFamily : kit?.visual?.typography?.bodyFamily)?.trim() ?? "";

/** Type scales with the SHORT edge, so a 9:16 headline is not four times a 1:1 one. */
const shortEdge = (spec: CanvasSpec) => Math.min(spec.width, spec.height);

/**
 * Resolve one variant for one placement. Empty text overlays are dropped here:
 * a person clearing a field mid-edit should not produce a blank plate.
 */
export function resolveRenderSpec(input: {
  variant: PlanVariant;
  placement: Placement;
  kit: BrandKit | null;
}): RenderSpec {
  const spec = specFor(input.placement);
  const safe = safeRect(spec);
  const short = shortEdge(spec);
  const kit = input.kit;

  const texts: ResolvedTextLayer[] = [];
  const logos: ResolvedLogoLayer[] = [];

  for (const o of input.variant.overlays) {
    if (o.kind === "logo") {
      const locator = brandLogoLocator(kit, o.logoRole);
      if (locator) logos.push({ id: o.id, locator, anchor: o.anchor, boxWidthPx: Math.round(safe.width * o.widthFraction) });
      continue;
    }
    const text = o.text.trim();
    if (!text) continue;
    const colorHex = (o.style.colorHex && normalizeHex(o.style.colorHex)) || swatch(kit, o.style.colorRole);
    texts.push({
      id: o.id,
      role: o.role,
      text,
      anchor: o.anchor,
      align: o.style.align,
      fontFamily: familyFor(kit, o.style.family),
      fontWeight: o.style.weight,
      fontSizePx: Math.max(8, Math.round(short * o.style.sizeFraction)),
      colorHex,
      backdrop: o.style.backdrop,
      backdropHex: plateFor(kit, colorHex),
      maxWidthPx: Math.max(1, Math.round(safe.width * o.style.maxWidthFraction)),
    });
  }

  const baseAssetId = input.variant.shots[0]?.assetId;
  return {
    placement: input.placement,
    variantId: input.variant.id,
    canvas: { width: spec.width, height: spec.height },
    safe,
    gutter: gutterOf(spec),
    base: baseAssetId ? assetLocator(baseAssetId) : null,
    backgroundHex: swatch(kit, "surface"),
    texts,
    logos,
  };
}
