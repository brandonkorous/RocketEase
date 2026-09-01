/*
 * The number the monthly spend ceiling accrues against.
 *
 * A null here does not read as an error anywhere — it reads as a job that cost
 * nothing, which silently raises the ceiling. That is what happened to video
 * (docs/bugs/B-009), so these pin both directions.
 */
import { describe, expect, it } from "vitest";
import { vendorCostUsd } from "./vendor-cost";

describe("vendorCostUsd", () => {
  it("prefers what the vendor actually said, and never recomputes over it", () => {
    expect(vendorCostUsd(0.0154, 1, 0.05)).toBe(0.0154);
  });

  it("computes per-unit spend when the vendor reports no dollars at all", () => {
    // Sora: 4 seconds echoed back, $0.10/s configured.
    expect(vendorCostUsd(undefined, 4, 0.1)).toBe(0.4);
    expect(vendorCostUsd(undefined, 12, 0.1)).toBe(1.2);
  });

  it("keeps a reported ZERO, which is a real answer and not a missing one", () => {
    expect(vendorCostUsd(0, 4, 0.1)).toBe(0);
  });

  it("returns null — never 0 — with no rate configured", () => {
    expect(vendorCostUsd(undefined, 4, undefined)).toBeNull();
    expect(vendorCostUsd(undefined, 4, null)).toBeNull();
  });

  it("returns null with no quantity, rather than billing a rate against nothing", () => {
    expect(vendorCostUsd(undefined, 0, 0.1)).toBeNull();
    expect(vendorCostUsd(undefined, undefined, 0.1)).toBeNull();
  });

  it("rounds to the sixth decimal the column stores, not to whole cents", () => {
    expect(vendorCostUsd(undefined, 3, 0.0333333)).toBe(0.1);
  });
});
