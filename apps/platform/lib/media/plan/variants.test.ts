import { describe, expect, it } from "vitest";
import { parsePlan } from "./schema";
import { starterPlan, textOverlay } from "./starter";
import type { AdPlan, TextOverlay } from "./types";
import { expandVariants, renderCount, variantById } from "./variants";

const base = (): AdPlan =>
  starterPlan({
    objective: "sales",
    title: "Spring sale",
    placements: ["meta_reels_9x16", "meta_feed_4x5"],
    headline: "Half price this week",
    cta: "Shop now",
  });

const textAt = (plan: AdPlan, role: string) => plan.overlays.find((o) => o.kind === "text" && o.role === role) as TextOverlay;

describe("expandVariants", () => {
  it("returns just the base when no axes are declared", () => {
    const v = expandVariants(base());
    expect(v).toHaveLength(1);
    expect(v[0].id).toBe("base");
    expect(v[0].axis).toBeNull();
  });

  it("adds ONE variant per value — linear, never a cross product", () => {
    const plan = base();
    plan.variants = [
      { id: "h", kind: "hook", values: ["Ends Sunday", "Last chance"] },
      { id: "c", kind: "cta", values: ["Buy now"] },
    ];
    // 1 base + 2 hooks + 1 cta = 4, not 1 + (2 x 1) permutations.
    expect(expandVariants(plan)).toHaveLength(4);
  });

  it("changes only the headline on a hook variant, leaving the CTA alone", () => {
    const plan = base();
    plan.variants = [{ id: "h", kind: "hook", values: ["Ends Sunday"] }];
    const variant = expandVariants(plan)[1];
    expect(textAt({ ...plan, overlays: variant.overlays }, "headline").text).toBe("Ends Sunday");
    expect(textAt({ ...plan, overlays: variant.overlays }, "cta").text).toBe("Shop now");
  });

  it("never mutates the plan it was given", () => {
    const plan = base();
    plan.variants = [{ id: "h", kind: "hook", values: ["Ends Sunday"] }];
    expandVariants(plan);
    expect(textAt(plan, "headline").text).toBe("Half price this week");
  });

  it("swaps the opening frame without touching a word of copy", () => {
    const plan = base();
    plan.variants = [{ id: "f", kind: "opening_frame", values: ["asset-2"] }];
    const variant = expandVariants(plan)[1];
    expect(variant.shots[0].assetId).toBe("asset-2");
    expect(variant.overlays).toEqual(plan.overlays);
  });

  it("marks a variant INERT rather than rendering a duplicate of the base", () => {
    const plan = base();
    plan.overlays = plan.overlays.filter((o) => !(o.kind === "text" && o.role === "cta"));
    plan.variants = [{ id: "c", kind: "cta", values: ["Buy now"] }];
    const variant = expandVariants(plan)[1];
    expect(variant.inert).toMatch(/no call-to-action overlay/);
  });

  it("marks an opening-frame variant inert when the plan has no shots", () => {
    const plan = base();
    plan.shots = [];
    plan.variants = [{ id: "f", kind: "opening_frame", values: ["asset-2"] }];
    expect(expandVariants(plan)[1].inert).toMatch(/no shots/);
  });

  it("labels variants so a person can tell them apart in a list", () => {
    const plan = base();
    plan.variants = [{ id: "h", kind: "hook", values: ["A much longer alternative hook than fits on one line"] }];
    expect(expandVariants(plan)[1].label).toBe("Hook — A much longer alternative hook…");
  });

  it("finds a variant by id, and nothing for an unknown one", () => {
    const plan = base();
    plan.variants = [{ id: "h", kind: "hook", values: ["Ends Sunday"] }];
    expect(variantById(plan, "h:0")?.axis).toBe("hook");
    expect(variantById(plan, "nope")).toBeUndefined();
  });
});

describe("renderCount", () => {
  it("multiplies live variants by placements and reports what it will skip", () => {
    const plan = base();
    plan.variants = [{ id: "h", kind: "hook", values: ["Ends Sunday"] }];
    expect(renderCount(plan)).toEqual({ renders: 4, skipped: 0 });
  });

  it("counts inert variants as skipped rather than as renders", () => {
    const plan = base();
    plan.overlays = plan.overlays.filter((o) => !(o.kind === "text" && o.role === "cta"));
    plan.variants = [{ id: "c", kind: "cta", values: ["Buy now"] }];
    expect(renderCount(plan)).toEqual({ renders: 2, skipped: 2 });
  });
});

describe("parsePlan", () => {
  it("accepts a starter plan unchanged", () => {
    const parsed = parsePlan(base());
    expect("plan" in parsed).toBe(true);
  });

  it("names the field that failed rather than saying “invalid”", () => {
    const parsed = parsePlan({ ...base(), placements: [] });
    expect("error" in parsed && parsed.error).toMatch(/^placements:/);
  });

  it("rejects a placement we have no canvas for, instead of rendering nothing", () => {
    const parsed = parsePlan({ ...base(), placements: ["pinterest_pin"] });
    expect("error" in parsed).toBe(true);
  });

  it("rejects a colour override that is not a hex value", () => {
    const plan = base();
    const overlay = textOverlay("subhead", "Subhead") as TextOverlay;
    overlay.style.colorHex = "red" as string;
    plan.overlays.push(overlay);
    expect("error" in parsePlan(plan)).toBe(true);
  });

  it("keeps an empty text overlay — a person clearing a field mid-edit is not an error", () => {
    const plan = base();
    plan.overlays.push(textOverlay("subhead", ""));
    expect("plan" in parsePlan(plan)).toBe(true);
  });
});
