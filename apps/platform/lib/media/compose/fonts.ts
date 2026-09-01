/*
 * Which font actually rendered.
 *
 * A brand kit names "Inter". The render container has whatever it has, and
 * fontconfig substitutes SILENTLY — the image comes out looking wrong with no
 * error anywhere. That is the same class of bug as trusting a vendor's claimed
 * duration, so it gets the same treatment: probe, never believe.
 *
 * The probe is a measurement, not a lookup. We render a sample string in the
 * requested family and in a family that cannot exist, and compare metrics. Equal
 * metrics mean the request fell through to the same fallback. It is portable
 * (no fc-list, works wherever sharp works) and it measures the thing we care
 * about — will this draw in the brand font — rather than a proxy for it.
 */
import sharp from "sharp";

/** A name no foundry will ship, so it always lands on fontconfig's default. */
const ABSENT = "RkeAbsentFontProbe";
const SAMPLE = "Hamburgefonstiv 0123";
const PROBE_SIZE = 48;

export type FontResolution = {
  /** What the brand kit asked for. Empty when it asked for nothing. */
  requested: string;
  /** The Pango family string actually passed to the renderer. */
  used: string;
  /** True when the request could not be confirmed and a substitute may be in use. */
  substituted: boolean;
};

const cache = new Map<string, boolean>();

async function measure(family: string): Promise<string> {
  const buf = await sharp({
    text: { text: SAMPLE, font: `${family} ${PROBE_SIZE}`, rgba: true, dpi: 72 },
  })
    .png()
    .toBuffer();
  const { width, height } = await sharp(buf).metadata();
  return `${width}x${height}`;
}

/**
 * Best effort, cached per process. A probe that throws answers "unconfirmed"
 * rather than failing the render — a missing font must never lose the artwork.
 */
export async function isFamilyAvailable(family: string): Promise<boolean> {
  const key = family.trim().toLowerCase();
  if (!key) return false;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let available = false;
  try {
    const [requested, fallback] = await Promise.all([measure(family), measure(ABSENT)]);
    available = requested !== fallback;
  } catch {
    available = false;
  }
  cache.set(key, available);
  return available;
}

/** Pango weight names. `sans` alone is a valid description, so this composes cleanly. */
const WEIGHT: Record<string, string> = { regular: "", medium: "Medium", bold: "Bold" };

export type FontRequest = { family: string; weight: "regular" | "medium" | "bold" };

/**
 * Resolve a request into a Pango font description plus the honest verdict.
 * An empty request is NOT a substitution — nobody asked for anything specific,
 * so the generic `sans` is exactly right and there is nothing to warn about.
 */
export async function resolveFont(req: FontRequest): Promise<FontResolution & { description: string }> {
  const requested = req.family.trim();
  const suffix = WEIGHT[req.weight] ? ` ${WEIGHT[req.weight]}` : "";
  if (!requested) {
    return { requested: "", used: "sans", substituted: false, description: `sans${suffix}` };
  }
  const available = await isFamilyAvailable(requested);
  const used = available ? requested : "sans";
  return { requested, used, substituted: !available, description: `${used}${suffix}` };
}

/** Test seam: the probe caches per process, and fixtures need a clean slate. */
export const __resetFontCache = () => cache.clear();

/** Pango markup is XML. Unescaped copy containing `&` or `<` renders as garbage or throws. */
export const escapeMarkup = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
