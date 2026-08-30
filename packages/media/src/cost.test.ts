import { describe, expect, it } from "vitest";
import { modelByKey } from "./catalog";
import { estimate, parseRates, quantityFor, totalEstimate } from "./cost";
import { isUnknownCost, type GenerationSpec } from "./types";

const video = () => modelByKey("mock-video")!;
const image = () => modelByKey("mock-image")!;
const audio = () => modelByKey("mock-audio")!;
const spec = (over: Partial<GenerationSpec> = {}): GenerationSpec => ({ jobKind: "hero_shot", prompt: "hello", ...over });

describe("quantityFor", () => {
  it("counts video seconds across the requested count", () => {
    expect(quantityFor(video(), spec({ durationSeconds: 8, count: 1 }))).toEqual({ quantity: 8, unit: "video_seconds" });
  });

  it("counts images", () => {
    expect(quantityFor(image(), spec({ jobKind: "product_still", count: 3 }))).toEqual({ quantity: 3, unit: "images" });
  });

  it("counts characters for a character-billed model", () => {
    expect(quantityFor(audio(), spec({ jobKind: "voiceover", prompt: "12345" }))).toEqual({ quantity: 5, unit: "characters" });
  });

  it("returns null when a duration-billed request has no duration", () => {
    expect(quantityFor(video(), spec())).toBeNull();
  });
});

describe("estimate", () => {
  it("refuses to guess when no rate is configured", () => {
    const e = estimate(video(), spec({ durationSeconds: 8 }));
    expect(isUnknownCost(e)).toBe(true);
    if (!isUnknownCost(e)) return;
    expect(e.unknown).toContain("No rate is configured");
  });

  it("prices from a configured rate", () => {
    const e = estimate(video(), spec({ durationSeconds: 8 }), { "mock-video": 0.4 });
    expect(isUnknownCost(e)).toBe(false);
    if (isUnknownCost(e)) return;
    expect(e.amountUsd).toBeCloseTo(3.2, 6);
    expect(e.unit).toBe("video_seconds");
  });

  it("explains a missing quantity rather than pricing it as zero", () => {
    const e = estimate(video(), spec(), { "mock-video": 0.4 });
    expect(isUnknownCost(e)).toBe(true);
    if (!isUnknownCost(e)) return;
    expect(e.unknown).toContain("doesn't say how many");
  });

  it("carries the model's verified flag through, so an unsourced rate stays flagged", () => {
    const e = estimate(image(), spec({ jobKind: "product_still" }), { "mock-image": 0.03 });
    expect(isUnknownCost(e) ? null : e.verified).toBe(false);
  });
});

describe("parseRates", () => {
  it("reads a rate map", () => {
    expect(parseRates('{"veo-3.1":0.4,"mock-video":0}')).toEqual({ "veo-3.1": 0.4, "mock-video": 0 });
  });

  it("warns and stays unpriced on malformed JSON rather than defaulting to zero", () => {
    const warnings: string[] = [];
    expect(parseRates("{not json", (m) => warnings.push(m))).toEqual({});
    expect(warnings).toHaveLength(1);
  });

  it("drops negative and non-numeric rates", () => {
    expect(parseRates('{"a":-1,"b":"x","c":0.5}')).toEqual({ c: 0.5 });
  });

  it("is empty for undefined and blank", () => {
    expect(parseRates(undefined)).toEqual({});
    expect(parseRates("   ")).toEqual({});
  });
});

describe("totalEstimate", () => {
  it("sums what is known and counts what is not, never treating unknown as zero", () => {
    const t = totalEstimate([
      { quantity: 8, unit: "video_seconds", amountUsd: 3.2, verified: true },
      { unknown: "no rate" },
      { quantity: 1, unit: "images", amountUsd: 0.03, verified: true },
    ]);
    expect(t.amountUsd).toBeCloseTo(3.23, 6);
    expect(t.unknownCount).toBe(1);
  });

  it("counts a null amount as unknown", () => {
    const t = totalEstimate([{ quantity: 1, unit: "images", amountUsd: null, verified: false }]);
    expect(t.unknownCount).toBe(1);
  });
});
