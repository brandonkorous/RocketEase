import { describe, expect, it } from "vitest";
import { CANVAS_SPECS, PLACEMENTS, placementsForNetwork, specFor } from "./specs";
import {
  aspectLabel, containSize, coverCrop, gutter, intersects, overflowFraction,
  placeIn, safeRect, sameAspect, violatedEdges,
} from "./geometry";

const reels = specFor("meta_reels_9x16");

describe("canvas specs", () => {
  it("gives every placement a spec, so a new placement cannot be half-added", () => {
    for (const p of PLACEMENTS) expect(CANVAS_SPECS[p]).toBeTruthy();
  });

  it("never claims a safe zone is verified — no network publishes one we could read", () => {
    for (const p of PLACEMENTS) expect(CANVAS_SPECS[p].safeZoneVerified).toBe(false);
  });

  it("explains every unverified number rather than leaving it bare", () => {
    for (const p of PLACEMENTS) {
      const s = CANVAS_SPECS[p];
      if (!s.verified) expect(s.note.toLowerCase()).toContain("unverified");
      expect(s.safeZoneNote.length).toBeGreaterThan(20);
    }
  });

  it("keeps Meta's unified 14/35/6 exactly", () => {
    expect(reels.safeZone).toEqual({ top: 0.14, bottom: 0.35, left: 0.06, right: 0.06 });
  });

  it("groups placements by network so a channel is offered only what it can run", () => {
    expect(placementsForNetwork("meta")).toEqual(["meta_feed_4x5", "meta_feed_1x1", "meta_reels_9x16"]);
    expect(placementsForNetwork("nowhere")).toEqual([]);
  });
});

describe("safeRect", () => {
  it("insets by the declared fractions", () => {
    // 1080x1920, 14% top = 268.8 -> 269, 35% bottom = 672, 6% sides = 64.8 -> 65
    expect(safeRect(reels)).toEqual({ x: 65, y: 269, width: 950, height: 979 });
  });

  it("never returns a negative box, however greedy the chrome", () => {
    const greedy = { ...reels, safeZone: { top: 0.7, bottom: 0.7, left: 0.7, right: 0.7 } };
    const r = safeRect(greedy);
    expect(r.width).toBe(0);
    expect(r.height).toBe(0);
  });
});

describe("placeIn", () => {
  const area = { x: 100, y: 100, width: 800, height: 600 };

  it("puts a bottom-centre box on the bottom edge, centred", () => {
    expect(placeIn(area, "bottom_center", { width: 200, height: 50 })).toEqual({ x: 400, y: 650, width: 200, height: 50 });
  });

  it("puts a top-left box flush in the corner", () => {
    expect(placeIn(area, "top_left", { width: 200, height: 50 })).toEqual({ x: 100, y: 100, width: 200, height: 50 });
  });

  it("centres a middle_center box", () => {
    expect(placeIn(area, "middle_center", { width: 200, height: 100 })).toEqual({ x: 400, y: 350, width: 200, height: 100 });
  });

  it("clamps an oversized box flush rather than pushing it off-canvas", () => {
    const r = placeIn(area, "bottom_right", { width: 2000, height: 50 });
    expect(r.x).toBe(area.x);
  });
});

describe("violatedEdges", () => {
  it("is empty for something inside the safe area", () => {
    expect(violatedEdges(placeIn(safeRect(reels), "middle_center", { width: 400, height: 100 }), reels)).toEqual([]);
  });

  it("names the bottom band when a CTA sits under the Reels UI", () => {
    expect(violatedEdges({ x: 100, y: 1800, width: 400, height: 100 }, reels)).toEqual(["bottom"]);
  });

  it("names every edge a full-bleed box crosses", () => {
    expect(violatedEdges({ x: 0, y: 0, width: 1080, height: 1920 }, reels)).toEqual(["top", "bottom", "left", "right"]);
  });
});

describe("overflowFraction", () => {
  const outer = { x: 0, y: 0, width: 100, height: 100 };
  it("is 0 for a contained box", () => expect(overflowFraction({ x: 10, y: 10, width: 10, height: 10 }, outer)).toBe(0));
  it("is 1 for a box entirely outside", () => expect(overflowFraction({ x: 200, y: 0, width: 10, height: 10 }, outer)).toBe(1));
  it("is a half for a box half out", () => expect(overflowFraction({ x: 95, y: 0, width: 10, height: 10 }, outer)).toBeCloseTo(0.5));
  it("is 0 for a zero-area box rather than dividing by zero", () =>
    expect(overflowFraction({ x: 0, y: 0, width: 0, height: 0 }, outer)).toBe(0));
});

describe("coverCrop", () => {
  it("crops a wide source to a tall canvas without distorting it", () => {
    const crop = coverCrop({ width: 4000, height: 2000 }, { width: 1080, height: 1920 });
    expect(crop).toEqual({ x: 1438, y: 0, width: 1125, height: 2000 });
  });

  it("refuses to upscale — stretching 400px to 1080 is a person's decision", () => {
    expect(coverCrop({ width: 400, height: 400 }, { width: 1080, height: 1080 })).toBeNull();
  });

  it("returns null for a degenerate source rather than dividing by zero", () => {
    expect(coverCrop({ width: 0, height: 100 }, { width: 10, height: 10 })).toBeNull();
  });

  it("is a no-op crop when the ratios already agree", () => {
    expect(coverCrop({ width: 2160, height: 3840 }, { width: 1080, height: 1920 })).toEqual({ x: 0, y: 0, width: 2160, height: 3840 });
  });
});

describe("containSize / aspect", () => {
  it("fits a wide logo into a box by width", () => {
    expect(containSize({ width: 400, height: 100 }, { width: 200, height: 200 })).toEqual({ width: 200, height: 50 });
  });

  it("never returns a zero dimension for a real source", () => {
    expect(containSize({ width: 4000, height: 1 }, { width: 100, height: 100 })).toEqual({ width: 100, height: 1 });
  });

  it("labels ratios the way a person would say them", () => {
    expect(aspectLabel({ width: 1080, height: 1920 })).toBe("9:16");
    expect(aspectLabel({ width: 1080, height: 1350 })).toBe("4:5");
  });

  it("treats near-identical ratios as the same", () => {
    expect(sameAspect({ width: 1080, height: 1920 }, { width: 1082, height: 1920 })).toBe(true);
    expect(sameAspect({ width: 1080, height: 1080 }, { width: 1080, height: 1920 })).toBe(false);
  });
});

describe("gutter", () => {
  it("scales with the short edge", () => {
    expect(gutter(reels)).toBe(32);
    expect(gutter(specFor("meta_feed_1x1"))).toBe(32);
  });
});

describe("intersects", () => {
  it("is false for boxes that merely touch", () => {
    expect(intersects({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 10, height: 10 })).toBe(false);
  });
  it("is true for real overlap", () => {
    expect(intersects({ x: 0, y: 0, width: 10, height: 10 }, { x: 9, y: 9, width: 10, height: 10 })).toBe(true);
  });
});
