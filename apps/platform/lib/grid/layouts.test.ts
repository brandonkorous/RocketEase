/*
 * The rules worth pinning: every layout is dated and sourced, a surface never
 * claims a format its network cannot publish to it, and an unknown network or
 * surface degrades to "no grid" rather than a guessed one.
 */
import { describe, expect, it } from "vitest";
import { GRID_LAYOUTS, aspectLabel, describeLayout, isGridNetwork, layoutFor, layoutsFor } from "./layouts";

describe("grid layouts", () => {
  it("dates and sources every layout, and says why pinned tiles are not modelled", () => {
    for (const l of GRID_LAYOUTS) {
      expect(l.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(l.sourceNote.length).toBeGreaterThan(10);
      expect(l.pinnedNote.length).toBeGreaterThan(10);
      expect(l.formats.length).toBeGreaterThan(0);
    }
  });

  it("marks observed layouts unverified — no network publishes a spec", () => {
    expect(GRID_LAYOUTS.filter((l) => l.network !== "mock").every((l) => !l.verified)).toBe(true);
  });

  it("keeps surfaces unique per network and never puts Stories or text in a grid", () => {
    const keys = GRID_LAYOUTS.map((l) => `${l.network}.${l.surface}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const l of GRID_LAYOUTS) expect(l.formats).not.toContain("story");
    for (const l of GRID_LAYOUTS) expect(l.formats).not.toContain("text");
  });

  it("falls back to the first surface, and to nothing for a network without a grid", () => {
    expect(layoutFor("instagram", "reels")?.surface).toBe("reels");
    expect(layoutFor("instagram", "nonsense")?.surface).toBe("posts");
    expect(layoutFor("instagram", undefined)?.surface).toBe("posts");
    expect(layoutFor("linkedin", undefined)).toBeNull();
    expect(layoutsFor("facebook")).toEqual([]);
    expect(isGridNetwork("tiktok")).toBe(true);
    expect(isGridNetwork("facebook")).toBe(false);
  });

  it("describes a layout in the words the page shows", () => {
    expect(aspectLabel({ w: 3, h: 4 })).toBe("3:4");
    expect(describeLayout(layoutFor("instagram", "posts")!)).toBe("3 columns · 3:4 tiles · newest first");
    expect(describeLayout(layoutFor("youtube", "videos")!)).toBe("4 columns · 16:9 tiles · newest first · titles under tiles");
  });
});
