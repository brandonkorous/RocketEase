import { describe, expect, test, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));

import { meterIdentifier, overageCredits } from "./ai-overage";

describe("overage credits", () => {
  test("nothing is billed inside the allowance", () => {
    expect(overageCredits(0, 200)).toBe(0);
    expect(overageCredits(199.9, 200)).toBe(0);
    expect(overageCredits(200, 200)).toBe(0);
  });

  test("only whole credits above the allowance are billed", () => {
    expect(overageCredits(201, 200)).toBe(1);
    // A partial credit is not billed: 200.7 used floors to 200.
    expect(overageCredits(200.7, 200)).toBe(0);
    expect(overageCredits(250.9, 200)).toBe(50);
  });

  test("a zero or negative allowance bills everything used", () => {
    expect(overageCredits(12.4, 0)).toBe(12);
    expect(overageCredits(12.4, -5)).toBe(12);
  });
});

describe("meter identifier", () => {
  const start = new Date("2026-06-01T00:00:00Z");

  test("is stable for the same running total, so a resend cannot double-charge", () => {
    expect(meterIdentifier("sub1", "ws1", start, 40)).toBe(meterIdentifier("sub1", "ws1", start, 40));
  });

  test("changes with every dimension that changes the money", () => {
    const base = meterIdentifier("sub1", "ws1", start, 40);
    expect(meterIdentifier("sub2", "ws1", start, 40)).not.toBe(base);
    expect(meterIdentifier("sub1", "ws2", start, 40)).not.toBe(base);
    expect(meterIdentifier("sub1", "ws1", new Date("2026-07-01T00:00:00Z"), 40)).not.toBe(base);
    expect(meterIdentifier("sub1", "ws1", start, 41)).not.toBe(base);
  });
});
