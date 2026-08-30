import { describe, expect, it } from "vitest";
import type { CostEstimate } from "@rocketease/media";
import { decideCeiling, parseCeiling, startOfMonth, type Ceilings } from "./ceiling-policy";

const priced = (amountUsd: number): CostEstimate => ({ quantity: 1, unit: "renders", amountUsd, verified: true });
const unknown: CostEstimate = { unknown: "no rate configured" };
const c = (over: Partial<Ceilings> = {}): Ceilings => ({ perJob: null, perMonth: null, spentThisMonth: 0, ...over });

describe("decideCeiling", () => {
  it("allows anything when nothing is configured", () => {
    expect(decideCeiling(priced(1000), c())).toEqual({ allowed: true });
  });

  it("allows a job under the per-job ceiling", () => {
    expect(decideCeiling(priced(3.2), c({ perJob: 10 }))).toEqual({ allowed: true });
  });

  it("refuses a job over the per-job ceiling, naming both numbers", () => {
    const r = decideCeiling(priced(12), c({ perJob: 10 }));
    expect("error" in r && r.code).toBe("media_ceiling");
    expect("error" in r && r.error).toContain("$12.00");
    expect("error" in r && r.error).toContain("$10.00");
  });

  it("allows a job exactly at the per-job ceiling", () => {
    expect(decideCeiling(priced(10), c({ perJob: 10 }))).toEqual({ allowed: true });
  });

  it("refuses an unpriceable job when a per-job ceiling exists — unknown cost is not a free pass", () => {
    const r = decideCeiling(unknown, c({ perJob: 10 }));
    expect("error" in r && r.error).toContain("no configured rate");
  });

  it("refuses a priced-but-null estimate the same way", () => {
    const r = decideCeiling({ quantity: 1, unit: "renders", amountUsd: null, verified: false }, c({ perJob: 10 }));
    expect("error" in r && r.code).toBe("media_ceiling");
  });

  it("lets an unpriceable job through when only a monthly ceiling exists, since there is nothing to compare", () => {
    expect(decideCeiling(unknown, c({ perMonth: 100 }))).toEqual({ allowed: true });
  });

  it("refuses when the month's spend plus this job would exceed the monthly ceiling", () => {
    const r = decideCeiling(priced(10), c({ perMonth: 100, spentThisMonth: 95 }));
    expect("error" in r && r.error).toContain("$5.00 remains");
  });

  it("allows a job that exactly fits what is left", () => {
    expect(decideCeiling(priced(10), c({ perMonth: 100, spentThisMonth: 90 }))).toEqual({ allowed: true });
  });

  it("reports nothing remaining rather than a negative when already over", () => {
    const r = decideCeiling(priced(1), c({ perMonth: 100, spentThisMonth: 140 }));
    expect("error" in r && r.error).toContain("$0.00 remains");
  });
});

describe("parseCeiling", () => {
  it("reads a configured limit", () => {
    expect(parseCeiling("12.5")).toBe(12.5);
    expect(parseCeiling("0")).toBe(0);
  });

  it("ignores a malformed or negative value rather than treating it as zero", () => {
    for (const v of ["not a number", "-5", "", "   ", undefined]) expect(parseCeiling(v)).toBeNull();
  });
});

describe("startOfMonth", () => {
  it("is the first instant of the UTC month", () => {
    expect(startOfMonth(new Date("2026-08-30T12:34:56Z")).toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });

  it("handles the first day without rolling back", () => {
    expect(startOfMonth(new Date("2026-01-01T00:00:00Z")).toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });
});
