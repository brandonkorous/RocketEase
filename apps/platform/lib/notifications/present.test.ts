import { describe, expect, it } from "vitest";
import { bucketFor, groupByDay, pageNumbers, paging, whenLabel } from "./present";

const TZ = "America/Los_Angeles";
// 2026-09-05 10:00 Pacific = 17:00Z
const now = new Date("2026-09-05T17:00:00Z");

describe("day buckets in the workspace timezone", () => {
  it("splits today, yesterday and earlier on the zone's midnight, not UTC's", () => {
    expect(bucketFor(new Date("2026-09-05T08:00:00Z"), now, TZ)).toBe("Today"); // 1 AM Pacific
    expect(bucketFor(new Date("2026-09-05T06:59:00Z"), now, TZ)).toBe("Yesterday"); // 11:59 PM Pacific, Sep 4
    expect(bucketFor(new Date("2026-09-04T07:30:00Z"), now, TZ)).toBe("Yesterday");
    expect(bucketFor(new Date("2026-09-04T06:00:00Z"), now, TZ)).toBe("Earlier"); // Sep 3 Pacific
  });

  it("labels time today, weekday this week, date beyond", () => {
    expect(whenLabel(new Date("2026-09-05T16:41:00Z"), now, TZ)).toMatch(/9:41/);
    expect(whenLabel(new Date("2026-09-03T21:22:00Z"), now, TZ)).toMatch(/Thu/);
    expect(whenLabel(new Date("2026-08-20T21:22:00Z"), now, TZ)).toMatch(/Aug 20/);
  });

  it("groups a page in order without re-sorting", () => {
    const rows = [{ id: 1, createdAt: new Date("2026-09-05T16:00:00Z") }, { id: 2, createdAt: new Date("2026-09-05T15:00:00Z") }, { id: 3, createdAt: new Date("2026-09-04T15:00:00Z") }, { id: 4, createdAt: new Date("2026-08-01T15:00:00Z") }];
    expect(groupByDay(rows, now, TZ).map((g) => [g.bucket, g.rows.map((r) => r.id)])).toEqual([["Today", [1, 2]], ["Yesterday", [3]], ["Earlier", [4]]]);
  });
});

describe("paging", () => {
  it("clamps the requested page and reports the shown range", () => {
    expect(paging(23, 1)).toEqual({ page: 1, pages: 2, from: 1, to: 20, total: 23 });
    expect(paging(23, 2)).toEqual({ page: 2, pages: 2, from: 21, to: 23, total: 23 });
    expect(paging(23, 9)).toMatchObject({ page: 2 });
    expect(paging(23, 0)).toMatchObject({ page: 1 });
    expect(paging(0, 1)).toEqual({ page: 1, pages: 1, from: 0, to: 0, total: 0 });
  });

  it("shows first, last and a window around the current page", () => {
    expect(pageNumbers(1, 1)).toEqual([1]);
    expect(pageNumbers(1, 3)).toEqual([1, 2, 3]);
    expect(pageNumbers(5, 9)).toEqual([1, "gap", 4, 5, 6, "gap", 9]);
    expect(pageNumbers(9, 9)).toEqual([1, "gap", 8, 9]);
  });
});
