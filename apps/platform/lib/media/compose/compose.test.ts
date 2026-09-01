import { describe, expect, it } from "vitest";
import { readBrandKit } from "@/lib/brand/read";
import type { BrandKit } from "@/lib/brand/types";
import { safeRect } from "@/lib/media/canvas/geometry";
import { specFor } from "@/lib/media/canvas/specs";
import { starterPlan } from "@/lib/media/plan/starter";
import type { AdPlan } from "@/lib/media/plan/types";
import { expandVariants } from "@/lib/media/plan/variants";
import { currentFingerprints, fingerprint, orphanedRenders, renderStatuses, stableStringify } from "./fingerprint";
import { layoutOverlays } from "./layout";
import { luminance, resolveRenderSpec, swatch } from "./spec";

const plan = (): AdPlan =>
  starterPlan({ objective: "sales", title: "Spring", placements: ["meta_reels_9x16"], headline: "Half price", cta: "Shop now", assetId: "a1" });

const kit = (): BrandKit => {
  const base = readBrandKit({});
  return {
    ...base,
    visual: {
      ...base.visual,
      palette: [
        { name: "Ink", hex: "#0a0a0a", role: "text", note: "" },
        { name: "Paper", hex: "#ffffff", role: "surface", note: "" },
        { name: "Brand", hex: "#0a0a0a", role: "primary", note: "" },
      ],
      typography: { headingFamily: "Inter", bodyFamily: "Inter", weights: "", licenceNote: "" },
    },
  };
};

const specOf = (p: AdPlan, k: BrandKit | null = kit()) =>
  resolveRenderSpec({ variant: expandVariants(p)[0], placement: "meta_reels_9x16", kit: k });

describe("resolveRenderSpec", () => {
  it("resolves colours from the brand palette by role", () => {
    expect(specOf(plan()).texts[0].colorHex).toBe("#0a0a0a");
  });

  it("falls back to monochrome for a kit with no palette, rather than rendering nothing", () => {
    const s = specOf(plan(), null);
    expect(s.texts[0].colorHex).toBe("#0a0a0a");
    expect(s.backgroundHex).toBe("#ffffff");
  });

  it("lets an explicit hex override the role", () => {
    const p = plan();
    (p.overlays.find((o) => o.kind === "text") as { style: { colorHex?: string } }).style.colorHex = "#ff0000";
    expect(specOf(p).texts[0].colorHex).toBe("#ff0000");
  });

  it("sizes type against the SHORT edge, so 9:16 and 1:1 headlines match", () => {
    const p = plan();
    const tall = resolveRenderSpec({ variant: expandVariants(p)[0], placement: "meta_reels_9x16", kit: kit() });
    p.placements = ["meta_feed_1x1"];
    const square = resolveRenderSpec({ variant: expandVariants(p)[0], placement: "meta_feed_1x1", kit: kit() });
    expect(tall.texts[0].fontSizePx).toBe(square.texts[0].fontSizePx);
  });

  it("drops empty text overlays so no blank plate is drawn", () => {
    const p = plan();
    (p.overlays.find((o) => o.kind === "text") as { text: string }).text = "   ";
    expect(specOf(p).texts).toHaveLength(1); // the CTA survives; the headline does not
  });

  it("asks for the brand's own font families", () => {
    expect(specOf(plan()).texts[0].fontFamily).toBe("Inter");
  });

  it("asks for nothing when the kit names no typography — not a substitution", () => {
    expect(specOf(plan(), readBrandKit({})).texts[0].fontFamily).toBe("");
  });

  it("carries the placement's safe rect, so layout and preflight share one geometry", () => {
    expect(specOf(plan()).safe).toEqual(safeRect(specFor("meta_reels_9x16")));
  });

  it("has no base when the shot has no asset", () => {
    const p = plan();
    p.shots[0].assetId = undefined;
    expect(specOf(p).base).toBeNull();
  });
});

describe("plate contrast", () => {
  it("puts a dark plate behind light type and a light plate behind dark type", () => {
    const k = kit();
    const s = resolveRenderSpec({ variant: expandVariants(plan())[0], placement: "meta_reels_9x16", kit: k });
    // Default CTA colour role is `surface` (white) → needs the dark plate.
    const cta = s.texts.find((t) => t.role === "cta")!;
    expect(luminance(cta.colorHex)).toBeGreaterThan(0.5);
    expect(luminance(cta.backdropHex)).toBeLessThan(0.5);
  });

  it("refuses a brand pair with no contrast rather than drawing invisible type", () => {
    const base = readBrandKit({});
    const flat: BrandKit = {
      ...base,
      visual: { ...base.visual, palette: [
        { name: "a", hex: "#ffffff", role: "surface", note: "" },
        { name: "b", hex: "#fefefe", role: "primary", note: "" },
        { name: "c", hex: "#ffffff", role: "text", note: "" },
      ] },
    };
    const s = resolveRenderSpec({ variant: expandVariants(plan())[0], placement: "meta_reels_9x16", kit: flat });
    expect(s.texts[0].backdropHex).toBe("#0a0a0a");
  });

  it("reads swatches by role and falls back per role", () => {
    expect(swatch(null, "surface")).toBe("#ffffff");
    expect(swatch(null, "text")).toBe("#0a0a0a");
  });

  it("EXPANDS a three-digit brand swatch instead of silently ignoring it", () => {
    // lib/brand/read.ts accepts `#fff`, so rejecting it here would quietly
    // redraw a brand colour as the monochrome default.
    const base = readBrandKit({});
    const short: BrandKit = { ...base, visual: { ...base.visual, palette: [{ name: "Sky", hex: "#0af", role: "text", note: "" }] } };
    expect(swatch(short, "text")).toBe("#00aaff");
  });
});

describe("layoutOverlays", () => {
  const area = { x: 0, y: 0, width: 1000, height: 1000 };

  it("stacks overlays sharing an anchor instead of piling them up", () => {
    const placed = layoutOverlays(
      [
        { id: "a", anchor: "middle_center", size: { width: 400, height: 100 } },
        { id: "b", anchor: "middle_center", size: { width: 200, height: 50 } },
      ],
      area,
      20,
    );
    expect(placed[0].rect.y).toBe(415);
    expect(placed[1].rect.y).toBe(535);
  });

  it("keeps groups independent — a growing headline never moves the CTA", () => {
    const cta = { id: "cta", anchor: "bottom_center" as const, size: { width: 200, height: 50 } };
    const small = layoutOverlays([{ id: "h", anchor: "middle_center", size: { width: 100, height: 50 } }, cta], area, 20);
    const large = layoutOverlays([{ id: "h", anchor: "middle_center", size: { width: 900, height: 400 } }, cta], area, 20);
    expect(small[1].rect).toEqual(large[1].rect);
  });

  it("keeps a right-anchored group flush right at every width", () => {
    const placed = layoutOverlays(
      [
        { id: "a", anchor: "top_right", size: { width: 400, height: 50 } },
        { id: "b", anchor: "top_right", size: { width: 100, height: 50 } },
      ],
      area,
      10,
    );
    expect(placed[0].rect.x + 400).toBe(1000);
    expect(placed[1].rect.x + 100).toBe(1000);
  });

  it("returns items in paint order, not group order", () => {
    const placed = layoutOverlays(
      [
        { id: "a", anchor: "bottom_center", size: { width: 10, height: 10 } },
        { id: "b", anchor: "top_left", size: { width: 10, height: 10 } },
      ],
      area,
      10,
    );
    expect(placed.map((p) => p.id)).toEqual(["a", "b"]);
  });
});

describe("fingerprint", () => {
  it("is stable across key order", () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
  });

  it("omits undefined rather than encoding it", () => {
    expect(stableStringify({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it("changes when a headline changes", () => {
    const before = fingerprint(specOf(plan()));
    const p = plan();
    (p.overlays.find((o) => o.kind === "text") as { text: string }).text = "Different";
    expect(fingerprint(specOf(p))).not.toBe(before);
  });

  it("changes when the BRAND changes, because the spec resolves the palette first", () => {
    const before = fingerprint(specOf(plan()));
    const k = kit();
    k.visual.palette = [{ name: "Ink", hex: "#123456", role: "text", note: "" }];
    expect(fingerprint(specOf(plan(), k))).not.toBe(before);
  });

  it("does NOT change when only the plan's title changes", () => {
    const p = plan();
    const before = fingerprint(specOf(p));
    p.title = "A completely different name";
    expect(fingerprint(specOf(p))).toBe(before);
  });
});

describe("renderStatuses", () => {
  it("reports every wanted render as missing before anything is rendered", () => {
    const statuses = renderStatuses(plan(), kit());
    expect(statuses).toHaveLength(1);
    expect(statuses[0].state).toBe("missing");
  });

  it("reports current when the fingerprint matches", () => {
    const p = plan();
    const fp = [...currentFingerprints(p, kit()).values()][0];
    p.renders = [{ placement: "meta_reels_9x16", variantId: "base", assetId: "out-1", fingerprint: fp, renderedAt: "2026-08-30T00:00:00Z" }];
    expect(renderStatuses(p, kit())[0]).toMatchObject({ state: "current", assetId: "out-1" });
  });

  it("reports stale after an edit, rather than serving the old file as current", () => {
    const p = plan();
    const fp = [...currentFingerprints(p, kit()).values()][0];
    p.renders = [{ placement: "meta_reels_9x16", variantId: "base", assetId: "out-1", fingerprint: fp, renderedAt: "2026-08-30T00:00:00Z" }];
    (p.overlays.find((o) => o.kind === "text") as { text: string }).text = "Edited";
    expect(renderStatuses(p, kit())[0].state).toBe("stale");
  });

  it("skips inert variants entirely — nothing to render, nothing to report", () => {
    const p = plan();
    p.overlays = p.overlays.filter((o) => !(o.kind === "text" && o.role === "cta"));
    p.variants = [{ id: "c", kind: "cta", values: ["Buy"] }];
    expect(renderStatuses(p, kit()).map((s) => s.variantId)).toEqual(["base"]);
  });

  it("finds renders orphaned by removing a placement", () => {
    const p = plan();
    p.renders = [{ placement: "meta_feed_1x1", variantId: "base", assetId: "old", fingerprint: "x", renderedAt: "2026-08-30T00:00:00Z" }];
    expect(orphanedRenders(p, kit()).map((r) => r.assetId)).toEqual(["old"]);
  });
});
