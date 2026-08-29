import { describe, expect, it } from "vitest";
import { PROVIDER_COST_NOTES, estimatePublishCost, isFreeToPublish } from "./cost";

describe("estimatePublishCost", () => {
  it("charges X per post and more when the post carries a link", () => {
    expect(estimatePublishCost("x", "x_account", { hasLink: false }).money).toMatchObject({ amount: 0.015, currency: "USD" });
    expect(estimatePublishCost("x", "x_account", { hasLink: true }).money).toMatchObject({ amount: 0.2, currency: "USD" });
  });

  it("defaults X to the plain-post price when the variant is unknown", () => {
    expect(estimatePublishCost("x", "x_account").money?.amount).toBe(0.015);
  });

  it("charges no money for X quota or caps we cannot source", () => {
    const c = estimatePublishCost("x", "x_account", { hasLink: true });
    expect(c.quota).toBeUndefined();
    expect(c.dailyCap).toBeUndefined();
  });

  it("spends 1,600 of YouTube's 10,000 daily units per upload", () => {
    const c = estimatePublishCost("youtube", "youtube_channel", { hasVideo: true });
    expect(c.quota).toEqual({ units: 1600, of: 10000, window: "day" });
    expect(c.dailyCap?.count).toBe(6);
    expect(c.money).toBeUndefined();
  });

  it("keeps the YouTube quota even before media is attached", () => {
    expect(estimatePublishCost("youtube", "youtube_channel", { hasVideo: false }).quota?.units).toBe(1600);
  });

  it("caps unaudited TikTok apps at 5 posts per 24 hours", () => {
    const c = estimatePublishCost("tiktok", "tiktok_account", {});
    expect(c.dailyCap).toMatchObject({ count: 5, window: "24h" });
    expect(c.dailyCap?.note).toMatch(/private/i);
    expect(c.money).toBeUndefined();
  });

  it("caps Instagram at 50 published posts per 24 hours", () => {
    expect(estimatePublishCost("meta", "instagram_business", { mediaCount: 3 }).dailyCap).toMatchObject({ count: 50, window: "24h" });
  });

  it("reports nothing for networks with no sourced cost or cap", () => {
    for (const kind of ["facebook_page", "linkedin_organization", "linkedin_member", "pinterest_account", "pinterest_board"] as const) {
      expect(isFreeToPublish(estimatePublishCost("meta", kind, { hasLink: true }))).toBe(true);
    }
  });

  it("never bills the demo network", () => {
    expect(estimatePublishCost("mock", "x_account", { hasLink: true })).toEqual({});
    expect(isFreeToPublish(estimatePublishCost("mock", "mock_profile", {}))).toBe(true);
  });

  it("has a sourced note for every provider", () => {
    for (const key of ["x", "youtube", "tiktok", "meta", "linkedin", "pinterest", "mock"] as const) {
      expect(PROVIDER_COST_NOTES[key].length).toBeGreaterThan(20);
    }
  });
});
