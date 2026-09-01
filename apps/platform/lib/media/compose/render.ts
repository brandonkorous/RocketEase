/*
 * The compositor. Deterministic, ours, and the reason the type is right.
 *
 * The model generates what is underneath; every string a client could be sued
 * over — the price, the offer, the CTA, the legal line — is drawn here from the
 * brand kit (docs/media-models.md §6).
 *
 * The renderer REPORTS what it did: where each overlay landed, which fonts it
 * actually got, whether it had to upscale. The preflight judges that report. A
 * renderer that also decided what was acceptable could never be checked.
 */
import sharp from "sharp";
import { coverCrop, type Size } from "@/lib/media/canvas/geometry";
import type { FontResolution } from "./fonts";
import { plate, platePadding, plateStyle, renderLogoLayer, renderTextLayer } from "./layers";
import { layoutOverlays, type LayoutItem, type PlacedItem } from "./layout";
import type { RenderSpec } from "./spec";

export type RenderFinding = { code: string; detail: string };

export type RenderResult = {
  bytes: Buffer;
  mimeType: string;
  extension: string;
  size: Size;
  placed: PlacedItem[];
  fonts: FontResolution[];
  findings: RenderFinding[];
};

export type RenderInput = {
  spec: RenderSpec;
  /** Bytes for `spec.base`, fetched by the caller. Null renders the brand surface. */
  base: Buffer | null;
  /** Bytes per logo overlay id. A missing entry is reported, never fatal. */
  logos: Record<string, Buffer>;
};

const RADIUS = 10;

/** The canvas: the base image cropped to fill, or a flat brand surface. */
async function background(input: RenderInput, findings: RenderFinding[]): Promise<Buffer> {
  const { canvas, backgroundHex } = input.spec;
  const flat = sharp({ create: { width: canvas.width, height: canvas.height, channels: 3, background: backgroundHex } });
  if (!input.base) {
    if (input.spec.base) findings.push({ code: "base_missing", detail: "The image this ad is built on could not be read, so the ad rendered on a flat colour." });
    return flat.png().toBuffer();
  }
  const meta = await sharp(input.base).metadata();
  const source = { width: meta.width ?? 0, height: meta.height ?? 0 };
  const crop = coverCrop(source, canvas);
  if (!crop) {
    findings.push({
      code: "base_upscaled",
      detail: `The source image is ${source.width}×${source.height}, smaller than the ${canvas.width}×${canvas.height} canvas, so it was enlarged to fit.`,
    });
  }
  const pipeline = crop
    ? sharp(input.base).extract({ left: crop.x, top: crop.y, width: crop.width, height: crop.height })
    : sharp(input.base);
  return pipeline.resize(canvas.width, canvas.height, { fit: "cover" }).png().toBuffer();
}

type Drawable = { input: Buffer; top: number; left: number };

/** Measure every overlay, then place them all at once — layout needs real sizes. */
async function measure(input: RenderInput, findings: RenderFinding[]) {
  const texts = await Promise.all(input.spec.texts.map(async (t) => ({ layer: t, rendered: await renderTextLayer(t) })));
  const logos: { id: string; boxWidthPx: number; rendered: Awaited<ReturnType<typeof renderLogoLayer>> }[] = [];
  for (const l of input.spec.logos) {
    const bytes = input.logos[l.id];
    const rendered = bytes ? await renderLogoLayer(bytes, l.boxWidthPx) : null;
    if (!rendered) findings.push({ code: "logo_missing", detail: "A logo in this plan could not be read from the brand kit, so it was left out." });
    logos.push({ id: l.id, boxWidthPx: l.boxWidthPx, rendered });
  }
  return { texts, logos };
}

/** Plate first, then type, so the plate never covers the words it exists for. */
function drawText(t: { layer: RenderSpec["texts"][number]; rendered: Awaited<ReturnType<typeof renderTextLayer>> }, placed: PlacedItem): Drawable[] {
  const style = plateStyle(t.layer.backdrop, t.layer.backdropHex);
  if (!style) return [{ input: t.rendered.buffer, top: placed.rect.y, left: placed.rect.x }];
  const pad = platePadding(t.layer.fontSizePx);
  const box = {
    x: Math.max(0, placed.rect.x - pad),
    y: Math.max(0, placed.rect.y - pad),
    width: placed.rect.width + pad * 2,
    height: placed.rect.height + pad * 2,
  };
  return [
    { input: plate(box, style.hex, style.opacity, RADIUS), top: box.y, left: box.x },
    { input: t.rendered.buffer, top: placed.rect.y, left: placed.rect.x },
  ];
}

/**
 * The overlays alone, on transparency, at full canvas size.
 *
 * Video assembly (12.4) needs the SAME composited type the static ad gets, but
 * as a layer ffmpeg can put over moving footage. Sharing the measure/layout path
 * is the point: a headline cannot land in one place on a still and another on a
 * video.
 */
export async function renderOverlayLayer(spec: RenderSpec): Promise<RenderResult> {
  return renderOnto(
    { spec, base: null, logos: {} },
    await sharp({
      create: { width: spec.canvas.width, height: spec.canvas.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer(),
    [],
    true,
  );
}

export async function renderAd(input: RenderInput): Promise<RenderResult> {
  const findings: RenderFinding[] = [];
  const canvasBytes = await background(input, findings);
  return renderOnto(input, canvasBytes, findings, !input.base);
}

/** The shared half: measure, lay out, paint. Both entry points end up here. */
async function renderOnto(input: RenderInput, canvasBytes: Buffer, findings: RenderFinding[], asPng: boolean): Promise<RenderResult> {
  const { texts, logos } = await measure(input, findings);

  const items: LayoutItem[] = [
    ...texts.map((t) => ({ id: t.layer.id, anchor: t.layer.anchor, size: t.rendered.size })),
    ...logos.flatMap((l, i) =>
      l.rendered ? [{ id: l.id, anchor: input.spec.logos[i].anchor, size: l.rendered.size }] : [],
    ),
  ];
  const placed = layoutOverlays(items, input.spec.safe, input.spec.gutter);
  const byId = new Map(placed.map((p) => [p.id, p]));

  const drawables: Drawable[] = [];
  for (const t of texts) {
    const p = byId.get(t.layer.id);
    if (p) drawables.push(...drawText(t, p));
  }
  for (const l of logos) {
    const p = byId.get(l.id);
    if (l.rendered && p) drawables.push({ input: l.rendered.buffer, top: p.rect.y, left: p.rect.x });
  }

  // PNG keeps flat art crisp and an overlay's alpha intact; photography does not
  // need either, and JPEG is a fraction of the size.
  const composed = sharp(canvasBytes).composite(drawables);
  const bytes = asPng ? await composed.png().toBuffer() : await composed.jpeg({ quality: 92, mozjpeg: true }).toBuffer();

  return {
    bytes,
    mimeType: asPng ? "image/png" : "image/jpeg",
    extension: asPng ? ".png" : ".jpg",
    size: input.spec.canvas,
    placed,
    fonts: texts.map((t) => t.rendered.font),
    findings,
  };
}
