import { describe, expect, it } from "vitest";
import { validateAgainstCapabilities } from "@rocketease/providers/client";
import type { Capabilities } from "@rocketease/providers/client";
import { countHashtags, hashtagLimits, insertTags, limitWarning, normalizeTags, renderTags } from "./hashtags";

describe("normalizeTags", () => {
  it("strips hashes, splits on spaces and commas, dedupes case-insensitively", () => {
    expect(normalizeTags("#Coffee, coffee  #latte\n#Latte, ##art")).toEqual(["Coffee", "latte", "art"]);
  });
  it("drops punctuation-only fragments", () => {
    expect(normalizeTags("# , -- ; #ok")).toEqual(["ok"]);
  });
  it("keeps non-latin tags", () => {
    expect(normalizeTags("#日本 #кофе")).toEqual(["日本", "кофе"]);
  });
});

describe("countHashtags", () => {
  it("counts the same things the provider validator counts", () => {
    const text = "#a #b #日本 no#t-a-tag";
    expect(countHashtags(text)).toBe(4); // "#t" in "no#t-a-tag" counts for the validator too
  });
  it("agrees with validateAgainstCapabilities at the boundary", () => {
    const caps = { formats: ["text"], scheduling: { supported: true }, limits: { hashtagsMax: 2 }, inbox: {}, insights: {}, ads: {}, ingestion: {} } as unknown as Capabilities;
    const text = renderTags(["a", "b", "c"]);
    expect(countHashtags(text)).toBe(3);
    expect(validateAgainstCapabilities(caps, { format: "text", text, media: [] }).some((i) => i.code === "too_many_hashtags")).toBe(true);
  });
});

describe("insertTags", () => {
  it("appends a block separated by a blank line", () => {
    expect(insertTags("Morning brew.", ["coffee", "latte"])).toBe("Morning brew.\n\n#coffee #latte");
  });
  it("never duplicates a tag already in the copy", () => {
    expect(insertTags("Hi #coffee", ["Coffee", "latte"])).toBe("Hi #coffee\n\n#latte");
  });
  it("is a no-op when every tag is already there", () => {
    expect(insertTags("#a #b", ["a", "b"])).toBe("#a #b");
  });
  it("starts clean copy with the block alone", () => {
    expect(insertTags("   ", ["a"])).toBe("#a");
  });
});

describe("hashtagLimits", () => {
  const channels = [
    { id: "ig", name: "Instagram", hashtagsMax: 3 },
    { id: "li", name: "LinkedIn", hashtagsMax: 10 },
    { id: "x", name: "X", hashtagsMax: null },
  ];
  it("flags only channels actually over their ceiling", () => {
    const out = hashtagLimits(channels, renderTags(["a", "b", "c", "d"]));
    expect(out.map((l) => l.channelId)).toEqual(["ig"]);
    expect(out[0]).toMatchObject({ max: 3, count: 4, over: 1 });
  });
  it("never guesses for a channel without a published ceiling", () => {
    expect(hashtagLimits([channels[2]], renderTags(Array.from({ length: 50 }, (_, i) => `t${i}`)))).toEqual([]);
  });
  it("says nothing when everything fits", () => {
    expect(limitWarning(hashtagLimits(channels, "#a #b"))).toBeNull();
  });
  it("names the worst channel and counts the rest", () => {
    const msg = limitWarning(hashtagLimits(channels, renderTags(Array.from({ length: 12 }, (_, i) => `t${i}`))));
    expect(msg).toContain("Instagram");
    expect(msg).toContain("1 other channel");
    expect(msg).toContain("12");
  });
});
