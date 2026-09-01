import { describe, expect, it } from "vitest";
import type { ModelDescriptor } from "@rocketease/media";
import { modelByKey } from "@rocketease/media";
import type { BrandKit } from "@/lib/brand/types";
import { readBrandKit } from "@/lib/brand/read";
import { paletteOf, productAnchored, resolveReferences, type ReferenceRequest } from "./references";

const kitWith = (over: Partial<BrandKit["visual"]>): BrandKit => {
  const kit = readBrandKit({});
  return { ...kit, visual: { ...kit.visual, ...over } };
};

const withCapacity = (max: number): ModelDescriptor => {
  const base = modelByKey("mock-image")!;
  return { ...base, label: "Test model", io: { ...base.io, inputs: { ...base.io.inputs, referenceImages: max ? { max, role: "subject" as const } : undefined } } };
};

const request = (over: Partial<ReferenceRequest> = {}): ReferenceRequest => ({
  product: [],
  style: [],
  talent: [],
  ...over,
});

const LOGO = { role: "primary" as const, key: "ws/w1/brand/primary.png", mimeType: "image/png", bytes: 100, note: "" };

describe("resolveReferences", () => {
  it("orders references product first, so the fidelity anchor is never the one that misses out", () => {
    const kit = kitWith({ logos: [LOGO] });
    const r = resolveReferences(request({ product: ["p1"], style: ["s1"], logoRole: "primary" }), withCapacity(9), kit);
    expect(r.refs.map((x) => x.role)).toEqual(["product", "logo", "style"]);
  });

  it("drops the LOWEST priority references when the model runs out of room", () => {
    const kit = kitWith({ logos: [LOGO] });
    const r = resolveReferences(request({ product: ["p1", "p2"], style: ["s1"], talent: ["t1"], logoRole: "primary" }), withCapacity(2), kit);
    expect(r.refs.map((x) => x.role)).toEqual(["product", "product"]);
    expect(r.dropped.map((d) => d.role)).toEqual(["logo", "style", "talent"]);
  });

  it("names every drop with the model and the ceiling that caused it", () => {
    const r = resolveReferences(request({ product: ["p1", "p2"] }), withCapacity(1), null);
    expect(r.dropped[0].reason).toBe("Test model accepts 1 reference image, and these ranked below the ones that fit");
    expect(r.notes[0]).toContain("1 reference dropped (product)");
  });

  it("says plainly when a model takes no references at all", () => {
    const r = resolveReferences(request({ product: ["p1"] }), withCapacity(0), null);
    expect(r.refs).toEqual([]);
    expect(r.dropped[0].reason).toBe("Test model does not accept reference images");
  });

  it("shouts when the product asked for did not reach the model", () => {
    const r = resolveReferences(request({ product: ["p1"] }), withCapacity(0), null);
    expect(r.notes.some((n) => n.includes("not anchored to a real photograph"))).toBe(true);
    expect(productAnchored(r)).toBe(false);
  });

  it("stays quiet when no product was asked for — that is a choice, not a failure", () => {
    const r = resolveReferences(request({ style: ["s1"] }), withCapacity(0), null);
    expect(r.notes.some((n) => n.includes("not anchored"))).toBe(false);
  });

  it("keeps a brand logo as an OBJECT locator, never as an asset id", () => {
    const r = resolveReferences(request({ logoRole: "primary" }), withCapacity(4), kitWith({ logos: [LOGO] }));
    expect(r.refs[0].locator).toEqual({ kind: "object", storageKey: "ws/w1/brand/primary.png" });
  });

  it("skips a logo role the kit does not have, rather than referencing nothing", () => {
    const r = resolveReferences(request({ logoRole: "mono_dark" }), withCapacity(4), kitWith({ logos: [LOGO] }));
    expect(r.refs).toEqual([]);
    expect(r.dropped).toEqual([]);
  });

  it("reports assets as ASSET locators", () => {
    const r = resolveReferences(request({ product: ["p1"] }), withCapacity(4), null);
    expect(r.refs[0].locator).toEqual({ kind: "asset", assetId: "p1" });
  });
});

describe("paletteOf", () => {
  it("keeps the kit's order and drops duplicates", () => {
    const kit = kitWith({
      palette: [
        { name: "Ink", hex: "#0A0A0A", role: "text", note: "" },
        { name: "Also ink", hex: "#0a0a0a", role: "primary", note: "" },
        { name: "Paper", hex: "#ffffff", role: "surface", note: "" },
      ],
    });
    expect(paletteOf(kit)).toEqual(["#0a0a0a", "#ffffff"]);
  });

  it("is empty for a kit with no palette, rather than inventing one", () => {
    expect(paletteOf(readBrandKit({}))).toEqual([]);
    expect(paletteOf(null)).toEqual([]);
  });

  it("stops at the limit", () => {
    const palette = Array.from({ length: 10 }, (_, i) => ({ name: `c${i}`, hex: `#00000${i}`, role: "neutral" as const, note: "" }));
    expect(paletteOf(kitWith({ palette }), 3)).toHaveLength(3);
  });
});
