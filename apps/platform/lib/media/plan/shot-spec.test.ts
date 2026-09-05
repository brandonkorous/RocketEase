/*
 * The rules worth pinning: coverage decides the generation aspect, references
 * travel product-first, and a duration only ever rounds UP — a short take
 * cannot be cut to a longer shot.
 */
import { describe, expect, it } from "vitest";
import { modelByKey } from "@rocketease/media";
import { starterPlan } from "./starter";
import { generationSeconds, shotAspect, shotSpec } from "./shot-spec";
import type { Shot } from "./types";

const shot = (over: Partial<Shot> = {}): Shot => ({
  id: "s1",
  jobKind: "hero_shot",
  direction: "the product on a beach",
  references: { product: ["pack-1"], style: ["mood-1"], talent: [] },
  ...over,
});

const plan = (placements: Parameters<typeof starterPlan>[0]["placements"]) =>
  starterPlan({ objective: "sales", title: "Spring", placements, headline: "Half price", cta: "Shop now", assetId: "a1" });

describe("shotAspect — coverage, not preference", () => {
  it("portrait wins whenever any placement is portrait — a square never becomes a Reel", () => {
    expect(shotAspect(["meta_reels_9x16", "meta_feed_1x1"])).toBe("9:16");
  });
  it("square covers feed-only plans — 4:5 at 1.25 is below the 1.5 portrait threshold", () => {
    expect(shotAspect(["meta_feed_1x1"])).toBe("1:1");
    expect(shotAspect(["meta_feed_4x5"])).toBe("1:1");
  });
});

describe("shotSpec", () => {
  it("carries the direction, the aspect, and the references product-first", () => {
    const spec = shotSpec(plan(["meta_reels_9x16"]), shot({ durationSeconds: 5 }));
    expect(spec).toMatchObject({ jobKind: "hero_shot", prompt: "the product on a beach", aspect: "9:16", durationSeconds: 5, count: 1 });
    expect(spec.references?.map((r) => r.role)).toEqual(["product", "style"]);
  });

  it("omits references entirely for a shot that names none — routing can then pick a text-only model", () => {
    const spec = shotSpec(plan(["meta_reels_9x16"]), shot({ references: { product: [], style: [], talent: [] } }));
    expect(spec.references).toBeUndefined();
  });
});

describe("generationSeconds — round up, never down", () => {
  const kling = modelByKey("fal-kling-25-pro-t2v")!;

  it("a 3-second shot generates a 5-second take to cut from", () => {
    expect(generationSeconds(kling.io, 3)).toBe(5);
  });
  it("a 7-second shot rounds UP to 10, not down to 5", () => {
    expect(generationSeconds(kling.io, 7)).toBe(10);
  });
  it("past the longest take, the longest is the honest answer", () => {
    expect(generationSeconds(kling.io, 14)).toBe(10);
  });
  it("a still has no duration to round", () => {
    expect(generationSeconds(modelByKey("fal-flux-2-pro")!.io, 3)).toBeNull();
  });
});
