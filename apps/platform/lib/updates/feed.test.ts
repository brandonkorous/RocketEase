import { describe, expect, it } from "vitest";
import { parseUpdateFeed, updateStanding } from "./feed";

describe("update feed", () => {
  it("reads the entry for the channel and ignores a feed it does not understand", () => {
    const feed = { stable: { version: "v1.2.0", imageTag: "v1.2.0", notes: "https://rocketease.com/releases/v1.2.0" }, edge: { version: "edge-abc1234" } };
    expect(parseUpdateFeed(feed, "stable")).toEqual(feed.stable);
    expect(parseUpdateFeed(feed, "edge")).toEqual({ version: "edge-abc1234" });
    expect(parseUpdateFeed({ stable: { version: "" } }, "stable")).toBeNull();
    expect(parseUpdateFeed("nope", "stable")).toBeNull();
    expect(parseUpdateFeed({}, "stable")).toBeNull();
  });

  it("says current only for the same label, and never computes a distance", () => {
    expect(updateStanding("v1.2.0", "v1.2.0")).toBe("current");
    expect(updateStanding("v1.1.0", "v1.2.0")).toBe("listed_newer");
    expect(updateStanding("edge-abc", "v1.2.0")).toBe("listed_newer");
    expect(updateStanding("v1.2.0", null)).toBe("unknown");
  });
});
