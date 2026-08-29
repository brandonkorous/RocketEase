import { describe, expect, test } from "vitest";
import { creditsFor, creditsFromColumn, creditsToColumn, formatCredits, roundCredits } from "./credits";

describe("credit math", () => {
  test("1,000 output tokens is exactly one credit", () => {
    expect(creditsFor({ inputTokens: 0, outputTokens: 1_000 })).toBe(1);
  });

  test("input tokens count at a fifth: 200 in is 0.04 credits", () => {
    expect(creditsFor({ inputTokens: 200, outputTokens: 0 })).toBe(0.04);
  });

  test("input and output add up", () => {
    expect(creditsFor({ inputTokens: 5_000, outputTokens: 2_500 })).toBe(3.5);
  });

  test("stored to four decimals, half up", () => {
    expect(creditsFor({ inputTokens: 1, outputTokens: 0 })).toBe(0.0002);
    expect(roundCredits(0.00005)).toBe(0.0001);
    expect(creditsToColumn(creditsFor({ inputTokens: 200, outputTokens: 1_000 }))).toBe("1.0400");
  });

  test("nonsense token counts are zero, never NaN", () => {
    expect(creditsFor({ inputTokens: -5, outputTokens: Number.NaN })).toBe(0);
    expect(creditsFromColumn(null)).toBe(0);
    expect(creditsFromColumn("12.3456")).toBe(12.3456);
  });

  test("display keeps small numbers precise and big ones plain", () => {
    expect(formatCredits(0.04)).toBe("0.04");
    expect(formatCredits(1_234.56)).toBe("1,235");
  });
});
