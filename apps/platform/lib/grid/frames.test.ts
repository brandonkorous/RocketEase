import { describe, expect, it } from "vitest";
import { frameOffsets } from "./frames";

describe("frameOffsets", () => {
  it("spaces frames inside the clip, away from the black first and last frames", () => {
    expect(frameOffsets(20, 6)).toEqual([1000, 4600, 8200, 11800, 15400, 19000]);
  });
  it("takes the first frame only when the length is unknown", () => {
    expect(frameOffsets(null)).toEqual([0]);
    expect(frameOffsets(0)).toEqual([0]);
  });
  it("clamps the count", () => {
    expect(frameOffsets(10, 0)).toEqual([500]);
    expect(frameOffsets(10, 99)).toHaveLength(12);
  });
});
