/*
 * Building the individual layers a composite is made of.
 *
 * Type is drawn by Pango through sharp, which does real line breaking and
 * reports the size it actually produced. That measurement is the input to
 * layout — estimating glyph advance would misplace every overlay in a font we
 * do not have, which is precisely the case we most need to be right about.
 */
import sharp from "sharp";
import type { Rect, Size } from "@/lib/media/canvas/geometry";
import { escapeMarkup, resolveFont, type FontResolution } from "./fonts";
import type { ResolvedTextLayer } from "./spec";

export type TextLayer = { buffer: Buffer; size: Size; font: FontResolution };

/** sharp accepts both spellings; be explicit rather than relying on the alias. */
const ALIGN = { left: "left", center: "centre", right: "right" } as const;

export async function renderTextLayer(layer: ResolvedTextLayer): Promise<TextLayer> {
  const font = await resolveFont({ family: layer.fontFamily, weight: layer.fontWeight });
  const markup = `<span foreground="${layer.colorHex}">${escapeMarkup(layer.text)}</span>`;
  const buffer = await sharp({
    text: {
      text: markup,
      font: `${font.description} ${layer.fontSizePx}`,
      rgba: true,
      dpi: 72,
      width: layer.maxWidthPx,
      wrap: "word",
      align: ALIGN[layer.align],
    },
  })
    .png()
    .toBuffer();
  const meta = await sharp(buffer).metadata();
  return {
    buffer,
    size: { width: meta.width ?? 0, height: meta.height ?? 0 },
    font: { requested: font.requested, used: font.used, substituted: font.substituted },
  };
}

/** Padding around a plate, proportional to the type it sits behind. */
export const platePadding = (fontSizePx: number): number => Math.round(fontSizePx * 0.4);

/**
 * A flat plate behind the type. Deliberately not a gradient — a solid rectangle
 * is legible, predictable, and produces the same pixels on every render.
 */
export function plate(rect: Rect, hex: string, opacity: number, radius: number): Buffer {
  const svg = `<svg width="${rect.width}" height="${rect.height}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect x="0" y="0" width="${rect.width}" height="${rect.height}" rx="${radius}" ry="${radius}" ` +
    `fill="${hex}" fill-opacity="${opacity}"/></svg>`;
  return Buffer.from(svg);
}

export type PlateStyle = { hex: string; opacity: number };

/** `scrim` darkens whatever is underneath; `box` is the brand's own plate colour. */
export const plateStyle = (backdrop: "none" | "scrim" | "box", hex: string): PlateStyle | null => {
  if (backdrop === "none") return null;
  return backdrop === "scrim" ? { hex: "#000000", opacity: 0.45 } : { hex, opacity: 1 };
};

export type LogoLayer = { buffer: Buffer; size: Size };

/** Fit a logo to a target width, never upscaling past its own resolution. */
export async function renderLogoLayer(bytes: Buffer, boxWidthPx: number): Promise<LogoLayer | null> {
  try {
    const meta = await sharp(bytes).metadata();
    // SVG has no intrinsic pixel size worth trusting; sharp rasterises it at the
    // width we ask for, so a vector logo is always drawn at full quality.
    const isVector = meta.format === "svg";
    const width = isVector ? boxWidthPx : Math.min(boxWidthPx, meta.width ?? boxWidthPx);
    const buffer = await sharp(bytes, isVector ? { density: 300 } : undefined)
      .resize({ width, withoutEnlargement: !isVector })
      .png()
      .toBuffer();
    const out = await sharp(buffer).metadata();
    return { buffer, size: { width: out.width ?? width, height: out.height ?? 0 } };
  } catch {
    return null;
  }
}
