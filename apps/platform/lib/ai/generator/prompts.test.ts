import { describe, expect, it } from "vitest";
import { EMPTY_BRAND_VOICE } from "../brand-voice";
import { AD_SPECS } from "./ad-specs";
import { adPrompt, briefBlock, conceptPrompt, repairPrompt, shortenPrompt, type GeneratorTarget } from "./prompts";
import type { Brief } from "./types";

const target: GeneratorTarget = {
  channelId: "ch1",
  network: "instagram",
  networkLabel: "Instagram",
  channelName: "BrightFit",
  textMax: 2_200,
  hashtagsMax: 30,
  formats: ["image", "carousel", "reel"],
  firstComment: true,
  altText: true,
  links: "none",
};

const brief: Brief = {
  goal: "traffic",
  topic: "New strength programme",
  keyPoints: ["Six weeks", "Three sessions a week"],
  channels: ["ch1"],
  count: 3,
  includeAds: false,
};

describe("briefBlock", () => {
  it("states plainly that there is no offer when the marketer typed none", () => {
    expect(briefBlock(brief)).toContain("Offer: none");
  });

  it("quotes the marketer's own offer and never rewrites it", () => {
    const withOffer = briefBlock({ ...brief, offer: "20% off until 30 June" });
    expect(withOffer).toContain("20% off until 30 June");
    expect(withOffer).not.toContain("Offer: none");
  });

  it("omits fields the marketer left blank rather than filling them in", () => {
    const block = briefBlock(brief);
    expect(block).not.toContain("Audience:");
    expect(block).not.toContain("Write in:");
  });
});

describe("conceptPrompt", () => {
  const p = conceptPrompt({ target, brief, voice: EMPTY_BRAND_VOICE });

  it("carries the channel's real limits, not network defaults", () => {
    expect(p.user).toContain("2200 characters");
    expect(p.user).toContain("At most 30 hashtags");
    expect(p.user).toContain("image, carousel, reel");
  });

  it("forbids invented facts and unsourced claims", () => {
    expect(p.system).toContain("Never invent facts");
    expect(p.system).toContain("The brief is the only source of facts");
  });

  it("tells the model the link is not clickable here", () => {
    expect(p.user).toContain("Links are not clickable here");
  });

  it("asks for the requested number of concepts and a JSON shape", () => {
    expect(p.user).toContain("Write 3 post concepts");
    expect(p.user).toContain('"concepts"');
    expect(p.system).toContain("Return JSON and nothing else");
  });

  it("passes rejected angles to Regenerate", () => {
    const again = conceptPrompt({ target, brief, voice: EMPTY_BRAND_VOICE, avoid: ["before and after"] });
    expect(again.user).toContain("before and after");
  });

  it("suppresses first comment and alt text when the channel has neither", () => {
    const bare = conceptPrompt({ target: { ...target, firstComment: false, altText: false }, brief, voice: EMPTY_BRAND_VOICE });
    expect(bare.user).toContain("leave firstComment empty");
    expect(bare.user).toContain("leave altText empty");
  });

  it("lets a per-run tone override the brand voice", () => {
    const toned = conceptPrompt({ target, brief: { ...brief, tone: "dry and factual" }, voice: EMPTY_BRAND_VOICE });
    expect(toned.system).toContain("dry and factual");
  });
});

describe("shortenPrompt", () => {
  it("asks for a cut, never a truncation, and states the overshoot", () => {
    const p = shortenPrompt({ target, hook: "a", body: "b", cta: "c", hashtags: ["x"], over: 42 });
    expect(p.user).toContain("42 characters too long");
    expect(p.user).toContain("Keep every concrete fact");
  });
});

describe("adPrompt", () => {
  it("describes only the fields the network actually has", () => {
    const p = adPrompt({ target: { ...target, network: "tiktok", networkLabel: "TikTok" }, spec: AD_SPECS.tiktok, brief, voice: EMPTY_BRAND_VOICE });
    expect(p.user).toContain("not used on TikTok");
    expect(p.user).toContain("at most 100 characters");
  });

  it("constrains the call to action to the allowed enum", () => {
    const p = adPrompt({ target, spec: AD_SPECS.linkedin, brief, voice: EMPTY_BRAND_VOICE });
    expect(p.user).toContain("learn_more");
    expect(p.user).toContain("aim for 70 characters or fewer");
  });
});

describe("repairPrompt", () => {
  it("keeps the original task and adds a blunter instruction", () => {
    const p = conceptPrompt({ target, brief, voice: EMPTY_BRAND_VOICE });
    const repaired = repairPrompt(p);
    expect(repaired.system).toBe(p.system);
    expect(repaired.user.startsWith(p.user)).toBe(true);
    expect(repaired.user).toContain("could not be parsed as JSON");
  });
});
