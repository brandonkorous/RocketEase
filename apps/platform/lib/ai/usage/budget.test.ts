import { describe, expect, test } from "vitest";
import { AI_CAP_MULTIPLIER, DEFAULT_AI_ALLOWANCE_CREDITS, aiCapMessage, allowanceFor, budgetFrom, capFor, readAiLimits } from "./budget";

const resetsAt = new Date("2026-09-01T07:00:00Z");
const limits = readAiLimits({});

describe("allowance and cap", () => {
  test("an unconfigured workspace gets the default allowance and a 3x cap", () => {
    expect(limits).toEqual({ allowanceCredits: DEFAULT_AI_ALLOWANCE_CREDITS, capCredits: DEFAULT_AI_ALLOWANCE_CREDITS * AI_CAP_MULTIPLIER });
  });

  test("settings override both, and the cap is never below the allowance", () => {
    expect(readAiLimits({ ai: { allowanceCredits: 500, capCredits: 600 } })).toEqual({ allowanceCredits: 500, capCredits: 600 });
    expect(readAiLimits({ ai: { allowanceCredits: 500, capCredits: 10 } }).capCredits).toBe(500);
  });

  test("junk in settings falls back rather than taking AI offline", () => {
    expect(readAiLimits({ ai: { allowanceCredits: "lots", capCredits: -1 } })).toEqual(limits);
    expect(readAiLimits(undefined)).toEqual(limits);
    expect(allowanceFor({ settings: {} })).toBe(DEFAULT_AI_ALLOWANCE_CREDITS);
    expect(capFor({ settings: { ai: { allowanceCredits: 100 } } })).toBe(300);
  });
});

describe("the cap refuses", () => {
  test("under the allowance everything is allowed", () => {
    const b = budgetFrom({ used: 12.5, limits, resetsAt, timezone: "America/Los_Angeles" });
    expect(b).toMatchObject({ allowed: true, used: 12.5, allowance: 200, cap: 600, remaining: 587.5 });
  });

  test("over the allowance but under the cap still generates", () => {
    expect(budgetFrom({ used: 250, limits, resetsAt, timezone: "UTC" }).allowed).toBe(true);
  });

  test("at the cap it refuses, and there is no headroom left", () => {
    const b = budgetFrom({ used: 600, limits, resetsAt, timezone: "UTC" });
    expect(b.allowed).toBe(false);
    expect(b.remaining).toBe(0);
  });

  test("past the cap it stays refused and never reports negative headroom", () => {
    const b = budgetFrom({ used: 900, limits, resetsAt, timezone: "UTC" });
    expect(b.allowed).toBe(false);
    expect(b.remaining).toBe(0);
  });

  test("the refusal names the reset date in the workspace timezone", () => {
    expect(aiCapMessage(resetsAt, "America/Los_Angeles")).toBe("This workspace has used its AI credits for the month. Credits reset on September 1, 2026.");
  });
});
