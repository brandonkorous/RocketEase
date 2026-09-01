/*
 * Real sharp, real pixels. These are the tests that would have caught a
 * compositor that draws a plate over the words it exists to make legible.
 */
import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import { readBrandKit } from "@/lib/brand/read";
import { violatedEdges } from "@/lib/media/canvas/geometry";
import { specFor } from "@/lib/media/canvas/specs";
import { starterPlan } from "@/lib/media/plan/starter";
import { expandVariants } from "@/lib/media/plan/variants";
import { __resetFontCache, isFamilyAvailable, escapeMarkup, resolveFont } from "./fonts";
import { renderAd } from "./render";
import { resolveRenderSpec, type RenderSpec } from "./spec";

/*
 * Resolved at MODULE scope, not in beforeAll: `it.skipIf` is evaluated while
 * tests are being collected, so anything it reads must already be settled.
 */
const CANDIDATES = ["Arial", "DejaVu Sans", "Liberation Sans", "Noto Sans", "Inter", "Segoe UI"];
const installedFamily = (await Promise.all(CANDIDATES.map(async (f) => ((await isFamilyAvailable(f)) ? f : null)))).find(Boolean);

const solid = (width: number, height: number, hex: string) =>
  sharp({ create: { width, height, channels: 3, background: hex } }).jpeg().toBuffer();

const spec = (over: Partial<Parameters<typeof starterPlan>[0]> = {}): RenderSpec => {
  const plan = starterPlan({
    objective: "sales",
    title: "Spring",
    placements: ["meta_reels_9x16"],
    headline: "Half price this week",
    cta: "Shop now",
    assetId: "a1",
    ...over,
  });
  return resolveRenderSpec({ variant: expandVariants(plan)[0], placement: "meta_reels_9x16", kit: readBrandKit({}) });
};

describe("renderAd", () => {
  it("produces an image at exactly the placement's canvas size", async () => {
    const base = await solid(2160, 3840, "#334455");
    const out = await renderAd({ spec: spec(), base, logos: {} });
    const meta = await sharp(out.bytes).metadata();
    expect([meta.width, meta.height]).toEqual([1080, 1920]);
  });

  it("keeps type inside the safe area when the plan's anchors are the defaults", async () => {
    const base = await solid(2160, 3840, "#334455");
    const s = spec();
    const out = await renderAd({ spec: s, base, logos: {} });
    for (const placed of out.placed) expect(violatedEdges(placed.rect, specFor("meta_reels_9x16"))).toEqual([]);
  });

  it("measures type rather than estimating it — every overlay has a real size", async () => {
    const out = await renderAd({ spec: spec(), base: null, logos: {} });
    expect(out.placed).toHaveLength(2);
    for (const p of out.placed) {
      expect(p.rect.width).toBeGreaterThan(0);
      expect(p.rect.height).toBeGreaterThan(0);
    }
  });

  it("renders flat art as PNG and photography as JPEG", async () => {
    const flat = await renderAd({ spec: spec(), base: null, logos: {} });
    expect(flat.mimeType).toBe("image/png");
    const photo = await renderAd({ spec: spec(), base: await solid(2160, 3840, "#334455"), logos: {} });
    expect(photo.mimeType).toBe("image/jpeg");
  });

  it("reports an upscale rather than silently enlarging a small source", async () => {
    const out = await renderAd({ spec: spec(), base: await solid(400, 700, "#334455"), logos: {} });
    expect(out.findings.map((f) => f.code)).toContain("base_upscaled");
    expect(out.findings[0].detail).toContain("400×700");
  });

  it("says so when the base image could not be read, and still returns artwork", async () => {
    const out = await renderAd({ spec: spec(), base: null, logos: {} });
    expect(out.findings.map((f) => f.code)).toContain("base_missing");
    expect(out.bytes.byteLength).toBeGreaterThan(0);
  });

  it("does not claim a base is missing when the plan never had one", async () => {
    const s = spec();
    const noBase: RenderSpec = { ...s, base: null };
    const out = await renderAd({ spec: noBase, base: null, logos: {} });
    expect(out.findings.map((f) => f.code)).not.toContain("base_missing");
  });

  it("renders copy containing ampersands and angle brackets verbatim, not as markup", async () => {
    const s = spec({ headline: "Tools & Tips <today>" });
    const out = await renderAd({ spec: s, base: null, logos: {} });
    expect(out.placed.length).toBeGreaterThan(0);
    expect(out.bytes.byteLength).toBeGreaterThan(0);
  });

  it("wraps long copy instead of running it off the canvas", async () => {
    const long = spec({ headline: "A considerably longer headline than will ever fit on a single line of a nine by sixteen advert" });
    const out = await renderAd({ spec: long, base: null, logos: {} });
    const headline = out.placed[0];
    expect(headline.rect.width).toBeLessThanOrEqual(long.safe.width);
    expect(headline.rect.height).toBeGreaterThan(long.texts[0].fontSizePx * 1.5);
  });

  it("composites a logo when its bytes are supplied, and reports it when they are not", async () => {
    const s = spec();
    const withLogo: RenderSpec = {
      ...s,
      logos: [{ id: "logo-1", locator: { kind: "object", storageKey: "k" }, anchor: "top_left", boxWidthPx: 200 }],
    };
    const ok = await renderAd({ spec: withLogo, base: null, logos: { "logo-1": await solid(400, 100, "#ff0000") } });
    expect(ok.placed.map((p) => p.id)).toContain("logo-1");

    const missing = await renderAd({ spec: withLogo, base: null, logos: {} });
    expect(missing.findings.map((f) => f.code)).toContain("logo_missing");
    expect(missing.placed.map((p) => p.id)).not.toContain("logo-1");
  });

  it("is deterministic — the same spec renders the same bytes", async () => {
    const s = spec();
    const a = await renderAd({ spec: s, base: null, logos: {} });
    const b = await renderAd({ spec: s, base: null, logos: {} });
    expect(a.bytes.equals(b.bytes)).toBe(true);
  });
});

describe("fonts", () => {
  beforeEach(() => __resetFontCache());

  it("escapes Pango markup so copy is never parsed as instructions", () => {
    expect(escapeMarkup('a & b < c > "d"')).toBe("a &amp; b &lt; c &gt; &quot;d&quot;");
  });

  it("treats an unnamed family as no preference, never as a substitution", async () => {
    const r = await resolveFont({ family: "  ", weight: "bold" });
    expect(r).toMatchObject({ used: "sans", substituted: false, description: "sans Bold" });
  });

  it("reports a family that cannot exist as substituted", async () => {
    const r = await resolveFont({ family: "RkeDefinitelyNotInstalled", weight: "regular" });
    expect(r.substituted).toBe(true);
    expect(r.used).toBe("sans");
  });

  // Which real families exist is environment-specific, and the generic aliases
  // (sans/serif/monospace) are NOT reliably distinct from the fallback — on a
  // box without fontconfig generics they all measure identically. So discover a
  // family that genuinely resolves, and skip if this machine has none.
  it.skipIf(!installedFamily)(`tells an installed family (${installedFamily}) apart from one that cannot exist`, async () => {
    expect(await isFamilyAvailable(installedFamily!)).toBe(true);
    expect(await isFamilyAvailable("RkeDefinitelyNotInstalled")).toBe(false);
  });

  it("puts the weight into the Pango description, since that is how weight is selected", async () => {
    expect((await resolveFont({ family: "", weight: "medium" })).description).toBe("sans Medium");
    expect((await resolveFont({ family: "", weight: "regular" })).description).toBe("sans");
  });
});
