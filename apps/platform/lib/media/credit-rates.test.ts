/*
 * Video reports no tokens, so this is the only thing standing between a Sora
 * clip and being free. The rule: unconfigured or unmeasured means NULL, never 0.
 */
import { describe, expect, it } from "vitest";
import { creditsForQuantity, parseCreditRates } from "./credit-rates";

describe("parseCreditRates", () => {
  it("reads a rate per billed unit", () => {
    expect(parseCreditRates('{"azure-sora-2":12}')).toEqual({ "azure-sora-2": 12 });
  });

  it("ignores malformed JSON with a warning rather than charging zero", () => {
    const warned: string[] = [];
    expect(parseCreditRates("{not json", (m) => warned.push(m))).toEqual({});
    expect(warned[0]).toContain("uncharged");
  });

  it("drops a rate that is not a usable number, naming the model", () => {
    const warned: string[] = [];
    expect(parseCreditRates('{"a":"12","b":-1,"c":3}', (m) => warned.push(m))).toEqual({ c: 3 });
    expect(warned.join(" ")).toContain("a");
  });

  it("is empty when unset", () => {
    expect(parseCreditRates(undefined)).toEqual({});
    expect(parseCreditRates("  ")).toEqual({});
  });
});

describe("creditsForQuantity", () => {
  const rates = { "azure-sora-2": 12 };

  it("bills the seconds at the configured rate", () => {
    expect(creditsForQuantity("azure-sora-2", 4, rates)).toBe(48);
    expect(creditsForQuantity("azure-sora-2", 12, rates)).toBe(144);
  });

  it("returns null when the model has no rate — unpriced, not free", () => {
    expect(creditsForQuantity("azure-sora-2", 8, {})).toBeNull();
  });

  it("returns null for a quantity it cannot use, rather than billing zero", () => {
    expect(creditsForQuantity("azure-sora-2", 0, rates)).toBeNull();
    expect(creditsForQuantity("azure-sora-2", null, rates)).toBeNull();
    expect(creditsForQuantity("azure-sora-2", Number.NaN, rates)).toBeNull();
  });

  it("distinguishes a zero rate from no rate — free on purpose is allowed", () => {
    expect(creditsForQuantity("azure-sora-2", 8, { "azure-sora-2": 0 })).toBe(0);
  });
});
