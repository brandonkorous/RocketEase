/*
 * The rules worth pinning: segments sum EXACTLY to the target (the plan never
 * lies about length), reshaping keeps a person's work, and the shorter button
 * is reversible in spirit — the longer one brings the count straight back.
 */
import { describe, expect, it } from "vitest";
import { starterPlan } from "./starter";
import { planShotDurations, plannedSeconds, reshapeShots } from "./duration";

const KLING = [5, 10];

const plan = () => {
  const p = starterPlan({ objective: "sales", title: "Spring", placements: ["meta_reels_9x16"], headline: "Half price", assetId: "a1" });
  p.shots[0] = { ...p.shots[0], jobKind: "hero_shot", direction: "opening on the product", durationSeconds: 10 };
  return p;
};

describe("planShotDurations", () => {
  it("splits the real lengths people ask for into model-legal takes", () => {
    expect(planShotDurations(15, KLING)).toEqual([10, 5]);
    expect(planShotDurations(20, KLING)).toEqual([10, 10]);
    expect(planShotDurations(30, KLING)).toEqual([10, 10, 10]);
  });

  it("gives an awkward remainder its own short shot — generation rounds up, assembly trims", () => {
    expect(planShotDurations(22, KLING)).toEqual([10, 10, 2]);
  });

  it("refuses a target the shot cap cannot hold, naming the fix", () => {
    expect(planShotDurations(120, KLING)).toHaveProperty("error");
  });

  it("refuses when the model declares no durations at all", () => {
    expect(planShotDurations(15, [])).toHaveProperty("error");
  });
});

describe("reshapeShots", () => {
  it("keeps existing direction and takes, retimes them, and extends with the last shot's kind", () => {
    const p = plan();
    const shots = reshapeShots(p, [10, 10, 10]);
    expect(shots).toHaveLength(3);
    expect(shots[0].direction).toBe("opening on the product");
    expect(shots[0].assetId).toBe("a1");
    expect(shots.map((s) => s.durationSeconds)).toEqual([10, 10, 10]);
    expect(shots[1].jobKind).toBe("hero_shot");
    expect(shots[1].assetId).toBeUndefined();
  });

  it("drops trailing shots when shortened — the other button brings the count back", () => {
    const p = plan();
    p.shots = reshapeShots(p, [10, 10, 10]);
    const shorter = reshapeShots(p, [10, 5]);
    expect(shorter).toHaveLength(2);
    expect(plannedSeconds({ ...p, shots: shorter })).toBe(15);
  });
});
