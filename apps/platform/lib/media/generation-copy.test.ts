/*
 * The one claim on this surface that is about a customer's money.
 */
import { describe, expect, it } from "vitest";
import { chargeNote } from "./generation-copy";

describe("what a failed generation says it cost", () => {
  it("says nothing was charged when the ledger recorded nothing", () => {
    expect(chargeNote(null)).toBe("Nothing was charged.");
    expect(chargeNote(0)).toBe("Nothing was charged.");
  });

  it("NEVER says 'nothing was charged' for a failure that was already billed", () => {
    // A video can succeed at the vendor and fail on download. The bill is real.
    expect(chargeNote(48)).not.toContain("Nothing");
    expect(chargeNote(48)).toContain("48 credits");
  });

  it("reads a fractional charge as it is, rather than rounding it to nothing", () => {
    expect(chargeNote(0.26)).toContain("0.26");
  });
});
