import { describe, expect, it } from "vitest";
import { AD_SPECS, adSpecFor, checkAdField, validateAdCopy } from "./ad-specs";

describe("ad specs", () => {
  it("covers the networks whose fields we could source, and no others", () => {
    expect(adSpecFor("facebook")?.networkLabel).toBe("Meta");
    expect(adSpecFor("instagram")?.networkLabel).toBe("Meta");
    expect(adSpecFor("linkedin")?.fields.headline.recommended).toBe(70);
    expect(adSpecFor("x")).toBeUndefined();
    expect(adSpecFor("youtube")).toBeUndefined();
  });

  it("marks TikTok unverified because its own docs could not be reached", () => {
    expect(AD_SPECS.tiktok.verified).toBe(false);
    expect(AD_SPECS.tiktok.fields.primaryText.note).toContain("Unverified");
  });

  it("cites a source for every network whose numbers we claim as verified", () => {
    for (const spec of Object.values(AD_SPECS)) {
      if (spec.verified) expect(spec.sourceUrl).toMatch(/^https:\/\//);
    }
  });
});

describe("checkAdField", () => {
  const meta = AD_SPECS.facebook.fields;

  it("warns past the recommended length instead of failing", () => {
    const issues = checkAdField(meta.headline, "headline", "x".repeat(40));
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("warning");
    expect(issues[0].message).toContain("27 is the recommended length");
  });

  it("says nothing when the copy fits", () => {
    expect(checkAdField(meta.headline, "headline", "Six weeks, three sessions")).toEqual([]);
  });

  it("warns on an empty field", () => {
    expect(checkAdField(meta.primaryText, "primaryText", "  ")[0].message).toContain("empty");
  });

  it("never errors on an unverified ceiling", () => {
    const issues = checkAdField(AD_SPECS.tiktok.fields.primaryText, "primaryText", "x".repeat(140));
    expect(issues[0].severity).toBe("warning");
    expect(issues[0].message).toContain("unverified");
  });

  it("flags copy written into a field the network does not have", () => {
    const issues = checkAdField(AD_SPECS.tiktok.fields.headline, "headline", "A headline");
    expect(issues[0].message).toContain("isn't used here");
    expect(checkAdField(AD_SPECS.tiktok.fields.headline, "headline", "")).toEqual([]);
  });
});

describe("validateAdCopy", () => {
  it("checks every field of the placement in order", () => {
    const issues = validateAdCopy(AD_SPECS.linkedin, { primaryText: "x".repeat(200), headline: "Fine", description: "" });
    expect(issues.map((i) => i.field)).toEqual(["primaryText", "description"]);
  });
});
