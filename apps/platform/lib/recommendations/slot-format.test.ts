import { describe, expect, it } from "vitest";
import { hourLabel, nextOccurrence, slotLabel, zonedSlot } from "./slot-format";

describe("slot labels", () => {
  it("formats hours as the composer shows them", () => {
    expect([0, 9, 12, 17, 23].map(hourLabel)).toEqual(["12am", "9am", "12pm", "5pm", "11pm"]);
  });

  it("names the weekday", () => {
    expect(slotLabel({ weekday: 2, hour: 9 })).toBe("Tuesday 9am");
  });
});

describe("zonedSlot", () => {
  it("resolves an instant into the workspace timezone", () => {
    // 2026-08-27T02:30Z is still Wednesday evening in New York.
    expect(zonedSlot(new Date("2026-08-27T02:30:00Z"), "America/New_York")).toEqual({ day: "2026-08-26", weekday: 3, hour: 22 });
    expect(zonedSlot(new Date("2026-08-27T02:30:00Z"), "UTC")).toEqual({ day: "2026-08-27", weekday: 4, hour: 2 });
  });
});

describe("nextOccurrence", () => {
  const from = new Date("2026-08-27T12:00:00Z"); // Thursday, 12:00 UTC

  it("keeps a slot later the same day", () => {
    expect(nextOccurrence({ weekday: 4, hour: 18 }, "UTC", from)).toEqual({ date: "2026-08-27", time: "18:00" });
  });

  it("rolls a slot that already passed to next week", () => {
    expect(nextOccurrence({ weekday: 4, hour: 9 }, "UTC", from)).toEqual({ date: "2026-09-03", time: "09:00" });
  });

  it("finds the next matching weekday", () => {
    expect(nextOccurrence({ weekday: 1, hour: 8 }, "UTC", from)).toEqual({ date: "2026-08-31", time: "08:00" });
  });
});
