/*
 * What must never drift: a gap is defined by the rhythm and only exists in the
 * future; too few live posts means no rhythm and no gaps (an unknown is not a
 * zero); newest sits first; live tiles sort like any other.
 */
import { describe, expect, it } from "vitest";
import { buildTiles, daysAhead, findGaps, inferCadenceDays, postState, usualTime } from "./tiles";
import type { GridPost } from "./types";

const post = (o: Partial<GridPost> & { key: string }): GridPost => ({
  kind: "post", itemId: o.key, variantId: `v-${o.key}`, title: o.key, text: "", format: "image", state: "live", localDay: null, localTime: null, at: null, thumbUrl: null, isVideo: false, remoteUrl: null, videoAssetId: null, coverOffsetMs: null, ...o,
});

describe("postState", () => {
  it("reads the variant first and approval only for drafts", () => {
    expect(postState({ status: "published", approvalState: "pending", itemStatus: "in_review" })).toBe("live");
    expect(postState({ status: "scheduled", approvalState: "not_required", itemStatus: "scheduled" })).toBe("scheduled");
    expect(postState({ status: "failed", approvalState: "approved", itemStatus: "failed" })).toBe("failed");
    expect(postState({ status: "draft", approvalState: "pending", itemStatus: "draft" })).toBe("review");
    expect(postState({ status: "draft", approvalState: "not_required", itemStatus: "draft" })).toBe("draft");
  });
});

describe("inferCadenceDays", () => {
  it("needs three live posts, then takes the median spacing", () => {
    expect(inferCadenceDays(["2026-09-01", "2026-09-03"])).toBeNull();
    expect(inferCadenceDays(["2026-09-01", "2026-09-03", "2026-09-05", "2026-09-12"])).toBe(2);
  });
  it("clamps to a week and never below a day", () => {
    expect(inferCadenceDays(["2026-06-01", "2026-07-01", "2026-08-01"])).toBe(7);
    expect(inferCadenceDays(["2026-09-01", "2026-09-01", "2026-09-01", "2026-09-02"])).toBe(1);
  });
});

describe("usualTime", () => {
  it("is 09:00 until there is a sample, then the median rounded to the half hour", () => {
    expect(usualTime(["18:00"])).toBe("09:00");
    expect(usualTime(["08:50", "09:10", "17:00"])).toBe("09:00");
    expect(usualTime(["10:20", "10:25", "10:40", "11:00", "12:00"])).toBe("10:30");
  });
});

describe("findGaps", () => {
  const today = "2026-09-05";
  it("returns nothing without a rhythm", () => {
    expect(findGaps({ liveDays: ["2026-09-01"], plannedDays: ["2026-09-20"], today, cadenceDays: null })).toEqual([]);
  });
  it("marks the stretch between posts that is longer than the rhythm, and only in the future", () => {
    expect(findGaps({ liveDays: ["2026-09-03"], plannedDays: ["2026-09-05", "2026-09-12"], today, cadenceDays: 2 })).toEqual(["2026-09-07", "2026-09-09", "2026-09-11"]);
  });
  it("keeps looking one rhythm past today when nothing is planned", () => {
    expect(findGaps({ liveDays: ["2026-09-04"], plannedDays: [], today, cadenceDays: 3 })).toEqual(["2026-09-07"]);
  });
  it("is quiet when planned posts keep the rhythm", () => {
    expect(findGaps({ liveDays: ["2026-09-04"], plannedDays: ["2026-09-06", "2026-09-08"], today, cadenceDays: 2 })).toEqual([]);
  });
  it("never floods the grid", () => {
    expect(findGaps({ liveDays: ["2026-09-01"], plannedDays: ["2026-12-01"], today, cadenceDays: 1 })).toHaveLength(6);
  });
});

describe("daysAhead", () => {
  const now = new Date("2026-09-05T12:00:00Z");
  it("counts whole days to the last planned post and floors at zero", () => {
    expect(daysAhead(["2026-09-08T09:00:00Z", "2026-09-12T20:00:00Z"], now)).toBe(7);
    expect(daysAhead(["2026-09-01T09:00:00Z"], now)).toBe(0);
    expect(daysAhead([], now)).toBe(0);
  });
});

describe("buildTiles", () => {
  it("puts the newest first, interleaves gaps, and drops undated posts", () => {
    const tiles = buildTiles(
      [post({ key: "old", localDay: "2026-09-01", localTime: "09:00" }), post({ key: "new", localDay: "2026-09-10", localTime: "09:00", state: "scheduled" }), post({ key: "undated" })],
      ["2026-09-07"],
      "09:00",
    );
    expect(tiles.map((t) => (t.kind === "gap" ? "gap" : t.key))).toEqual(["new", "gap", "old"]);
  });
  it("orders two tiles on the same day by time", () => {
    const tiles = buildTiles([post({ key: "am", localDay: "2026-09-10", localTime: "09:00" }), post({ key: "pm", localDay: "2026-09-10", localTime: "17:00" })], [], "09:00");
    expect(tiles.map((t) => t.key)).toEqual(["pm", "am"]);
  });
});
