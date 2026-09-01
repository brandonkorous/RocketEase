/*
 * The rule under test is the one that made this a shared function: generated
 * media is routinely sub-cent, and two decimals render a real charge as "$0.00".
 */
import { describe, expect, it } from "vitest";
import { formatCostUsd, formatUnitEstimate } from "./cost-format";

describe("formatCostUsd", () => {
  it("keeps four decimals under a cent, so a real charge never reads as free", () => {
    // The cheapest image actually measured against the live deployment.
    expect(formatCostUsd(0.004515)).toBe("$0.0045");
    expect(formatCostUsd(0.0001)).toBe("$0.0001");
  });

  it("uses two decimals from a cent up, the way money is normally written", () => {
    expect(formatCostUsd(0.015425)).toBe("$0.02");
    expect(formatCostUsd(1.5)).toBe("$1.50");
  });

  it("shows exactly zero as zero — free is a fact, not a rounding artefact", () => {
    expect(formatCostUsd(0)).toBe("$0.0000");
  });

  it("returns null for unknown, so a caller must say so rather than print a number", () => {
    expect(formatCostUsd(null)).toBeNull();
    expect(formatCostUsd(undefined)).toBeNull();
  });

  it("returns null for nonsense rather than rendering it", () => {
    expect(formatCostUsd(Number.NaN)).toBeNull();
    expect(formatCostUsd(Number.POSITIVE_INFINITY)).toBeNull();
    expect(formatCostUsd(-1)).toBeNull();
  });
});

describe("formatUnitEstimate", () => {
  it("prices one image", () => {
    expect(formatUnitEstimate(0.05)).toBe("Up to $0.05 per image.");
  });

  it("says nothing when there is no rate, rather than implying free", () => {
    expect(formatUnitEstimate(null)).toBeNull();
  });
});
