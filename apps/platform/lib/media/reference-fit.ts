/*
 * Making a real product photo usable as a model reference.
 *
 * Sora's `input_reference` becomes the literal FIRST FRAME, and it demands the
 * exact requested size — it does not letterbox, it refuses. A packshot is
 * almost never 720x1280, so it has to be fitted, and how it is fitted is a
 * brand decision rather than a technical one: the padding is on screen, in
 * frame one, for everyone to see.
 *
 * So the pad is a BRAND colour, and `contain` rather than `cover`: cropping a
 * product to fill a portrait frame is how you publish a bottle with its label
 * sliced off. Better letterboxed and whole than full-bleed and wrong.
 */
import sharp from "sharp";

/** Paper-ish neutral, used only when a workspace has recorded no palette. */
export const FALLBACK_PAD = "#ece6da";

export type FitInput = { bytes: Buffer; width: number; height: number; padHex?: string };

const HEX = /^#?([0-9a-f]{6})$/i;

/** `#6a39ff` -> sharp's rgb object. Anything unparseable falls back rather than throwing. */
export function padColour(hex: string | undefined): { r: number; g: number; b: number; alpha: number } {
  const m = HEX.exec((hex ?? "").trim());
  const v = m ? m[1] : FALLBACK_PAD.slice(1);
  return { r: parseInt(v.slice(0, 2), 16), g: parseInt(v.slice(2, 4), 16), b: parseInt(v.slice(4, 6), 16), alpha: 1 };
}

/**
 * Exactly width x height PNG, whole product, brand-coloured bars.
 *
 * PNG rather than JPEG because this is one frame that will be re-encoded by the
 * model anyway, and a generation loses nothing to being handed clean pixels.
 */
export async function fitReference({ bytes, width, height, padHex }: FitInput): Promise<Buffer> {
  return sharp(bytes)
    .resize({ width, height, fit: "contain", background: padColour(padHex) })
    .flatten({ background: padColour(padHex) })
    .png()
    .toBuffer();
}
