import { describe, expect, test } from "vitest";
import { currentMonthWindow, monthOf, monthWindow } from "./period";

/* The month boundary is the workspace's midnight, not UTC's. */
describe("month window in a non-UTC timezone", () => {
  test("Los Angeles starts the month seven hours after UTC does", () => {
    const w = monthWindow("2026-08", "America/Los_Angeles");
    expect(w.from.toISOString()).toBe("2026-08-01T07:00:00.000Z");
    expect(w.to.toISOString()).toBe("2026-09-01T07:00:00.000Z");
    expect(w.resetsAt).toEqual(w.to);
  });

  test("Auckland starts it twelve hours before UTC does", () => {
    const w = monthWindow("2026-08", "Pacific/Auckland");
    expect(w.from.toISOString()).toBe("2026-07-31T12:00:00.000Z");
    expect(w.to.toISOString()).toBe("2026-08-31T12:00:00.000Z");
  });

  test("December rolls into the next year", () => {
    const w = monthWindow("2026-12", "UTC");
    expect(w.to.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  test("the window crossing a DST change keeps local midnight on both ends", () => {
    const w = monthWindow("2026-03", "America/Los_Angeles");
    expect(w.from.toISOString()).toBe("2026-03-01T08:00:00.000Z");
    expect(w.to.toISOString()).toBe("2026-04-01T07:00:00.000Z");
  });

  test("an instant late on the last UTC day is still last month in Los Angeles", () => {
    const at = new Date("2026-09-01T04:00:00Z");
    expect(monthOf(at, "UTC")).toBe("2026-09");
    expect(monthOf(at, "America/Los_Angeles")).toBe("2026-08");
    expect(currentMonthWindow("America/Los_Angeles", at).month).toBe("2026-08");
  });
});
