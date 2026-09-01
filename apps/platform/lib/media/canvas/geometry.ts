/*
 * Canvas geometry. Pure integer maths — no image library, no I/O.
 *
 * This is the file that makes "your CTA will be covered by the Reels UI" a
 * computation rather than an opinion. Everything the compositor places and
 * everything the preflight checks goes through these functions, so an overlay
 * cannot be drawn by one rule and judged by another.
 */
import type { CanvasSpec, SafeZone } from "./specs";

export type Rect = { x: number; y: number; width: number; height: number };
export type Size = { width: number; height: number };

export const ANCHORS = [
  "top_left", "top_center", "top_right",
  "middle_left", "middle_center", "middle_right",
  "bottom_left", "bottom_center", "bottom_right",
] as const;
export type Anchor = (typeof ANCHORS)[number];

export const ANCHOR_LABELS: Record<Anchor, string> = {
  top_left: "Top left", top_center: "Top centre", top_right: "Top right",
  middle_left: "Middle left", middle_center: "Centre", middle_right: "Middle right",
  bottom_left: "Bottom left", bottom_center: "Bottom centre", bottom_right: "Bottom right",
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The region platform chrome leaves alone. Overlays live here or they get covered. */
export function safeRect(spec: CanvasSpec): Rect {
  const { width, height, safeZone: z } = spec;
  const x = Math.round(width * z.left);
  const y = Math.round(height * z.top);
  return {
    x,
    y,
    width: Math.max(0, width - x - Math.round(width * z.right)),
    height: Math.max(0, height - y - Math.round(height * z.bottom)),
  };
}

/** Pixels of breathing room between stacked overlays: 3% of the short edge. */
export const gutter = (spec: CanvasSpec): number => Math.round(Math.min(spec.width, spec.height) * 0.03);

const horizontal = (a: Anchor) => (a.endsWith("_left") ? "left" : a.endsWith("_right") ? "right" : "center");
const vertical = (a: Anchor) => (a.startsWith("top") ? "top" : a.startsWith("bottom") ? "bottom" : "middle");

/**
 * Place a box of `size` at `anchor` inside `area`. The result is clamped into
 * `area`, so an oversized overlay lands flush rather than half off-canvas —
 * the preflight reports it, the renderer still produces a usable file.
 */
export function placeIn(area: Rect, anchor: Anchor, size: Size): Rect {
  const h = horizontal(anchor);
  const v = vertical(anchor);
  const x = h === "left" ? area.x : h === "right" ? area.x + area.width - size.width : area.x + Math.round((area.width - size.width) / 2);
  const y = v === "top" ? area.y : v === "bottom" ? area.y + area.height - size.height : area.y + Math.round((area.height - size.height) / 2);
  return {
    x: clamp(x, area.x, Math.max(area.x, area.x + area.width - size.width)),
    y: clamp(y, area.y, Math.max(area.y, area.y + area.height - size.height)),
    width: size.width,
    height: size.height,
  };
}

export const right = (r: Rect) => r.x + r.width;
export const bottom = (r: Rect) => r.y + r.height;

export function intersects(a: Rect, b: Rect): boolean {
  return a.x < right(b) && b.x < right(a) && a.y < bottom(b) && b.y < bottom(a);
}

/** How much of `inner` falls outside `outer`, as a fraction of `inner`'s area. */
export function overflowFraction(inner: Rect, outer: Rect): number {
  const area = inner.width * inner.height;
  if (area <= 0) return 0;
  const w = Math.max(0, Math.min(right(inner), right(outer)) - Math.max(inner.x, outer.x));
  const h = Math.max(0, Math.min(bottom(inner), bottom(outer)) - Math.max(inner.y, outer.y));
  return 1 - (w * h) / area;
}

/** Which chrome bands a rect strays into. Empty means it is clear. */
export function violatedEdges(rect: Rect, spec: CanvasSpec): (keyof SafeZone)[] {
  const safe = safeRect(spec);
  const out: (keyof SafeZone)[] = [];
  if (rect.y < safe.y) out.push("top");
  if (bottom(rect) > bottom(safe)) out.push("bottom");
  if (rect.x < safe.x) out.push("left");
  if (right(rect) > right(safe)) out.push("right");
  return out;
}

/**
 * The crop of `source` that fills `canvas` without distortion — centred, and
 * never upscaled beyond what the source has. Returns null when the source is
 * too small to fill the canvas at all, because stretching a 400px image to
 * 1080 is a decision a person should make, not one we make quietly.
 */
export function coverCrop(source: Size, canvas: Size): Rect | null {
  if (source.width <= 0 || source.height <= 0 || canvas.width <= 0 || canvas.height <= 0) return null;
  const scale = Math.max(canvas.width / source.width, canvas.height / source.height);
  if (scale > 1) return null;
  const width = Math.round(canvas.width / scale);
  const height = Math.round(canvas.height / scale);
  return {
    x: Math.max(0, Math.round((source.width - width) / 2)),
    y: Math.max(0, Math.round((source.height - height) / 2)),
    width: Math.min(source.width, width),
    height: Math.min(source.height, height),
  };
}

/** Largest size fitting inside `box` at the source's own aspect ratio. */
export function containSize(source: Size, box: Size): Size {
  if (source.width <= 0 || source.height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(box.width / source.width, box.height / source.height);
  return { width: Math.max(1, Math.round(source.width * scale)), height: Math.max(1, Math.round(source.height * scale)) };
}

/** "9:16" for 1080×1920. Used in preflight messages, so it must read naturally. */
export function aspectLabel(size: Size): string {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const d = gcd(size.width, size.height) || 1;
  return `${size.width / d}:${size.height / d}`;
}

/** Two ratios are "the same" within a percent — JPEG dimensions are rarely exact. */
export function sameAspect(a: Size, b: Size, tolerance = 0.01): boolean {
  if (a.height === 0 || b.height === 0) return false;
  const ra = a.width / a.height;
  const rb = b.width / b.height;
  return Math.abs(ra - rb) / rb <= tolerance;
}
