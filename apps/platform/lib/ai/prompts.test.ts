import { describe, expect, test } from "vitest";
import { EMPTY_BRAND_VOICE, brandVoicePrompt, readBrandVoice, type BrandVoice } from "./brand-voice";
import { captionPrompt, parseVariants, repurposePrompt, replyPrompt, SAFETY_RULES, type DraftTarget } from "./prompts";

const voice: BrandVoice = { tone: "Direct, warm", audience: "Salon owners", doList: ["Lead with the problem"], dontList: ["No exclamation marks"], examples: ["We open at seven."] };
const target: DraftTarget = { channelId: "c1", network: "instagram", networkLabel: "Instagram", channelName: "Studio", textMax: 2200, hashtagsMax: 30 };

describe("brand voice", () => {
  test("reads a tolerant shape and drops junk", () => {
    const v = readBrandVoice({ brandVoice: { tone: " Warm ", doList: ["a", "", 7, " b "], examples: "nope" } });
    expect(v).toEqual({ tone: "Warm", audience: "", doList: ["a", "b"], dontList: [], examples: [] });
  });

  test("an empty voice contributes nothing to the prompt", () => {
    expect(brandVoicePrompt(EMPTY_BRAND_VOICE)).toBe("");
  });

  test("a configured voice names tone, audience, do, don't, and examples", () => {
    const p = brandVoicePrompt(voice);
    expect(p).toContain("Tone: Direct, warm");
    expect(p).toContain("Audience: Salon owners");
    expect(p).toContain("Do: Lead with the problem");
    expect(p).toContain("Don't: No exclamation marks");
    expect(p).toContain("We open at seven.");
    expect(p).toContain("imitate the voice, not the facts");
  });
});

describe("safety rules", () => {
  test("every prompt forbids invented facts, keeps disclosure, asks for plain language", () => {
    for (const p of [captionPrompt({ target, text: "hi", voice }), repurposePrompt({ target, sourceText: "long", voice })]) {
      expect(p.system).toContain(SAFETY_RULES);
      expect(p.system).toMatch(/Never invent facts/);
      expect(p.system).toMatch(/paid partnership|sponsored/);
      expect(p.system).toMatch(/plain language/i);
      expect(p.system).toMatch(/edit this and decide whether to send/);
    }
  });
});

describe("captionPrompt", () => {
  test("carries the channel's real limits, not an assumed default", () => {
    const p = captionPrompt({ target, text: "Our new hours", voice });
    expect(p.user).toContain("2200 characters");
    expect(p.user).toContain("At most 30 hashtags");
    expect(p.user).toContain("Our new hours");
    expect(p.user).toContain('channel "Studio"');
  });

  test("omits limits the provider didn't report", () => {
    const p = captionPrompt({ target: { ...target, textMax: undefined, hashtagsMax: undefined }, text: "x", voice });
    expect(p.user).not.toMatch(/Hard limit/);
    expect(p.user).not.toMatch(/hashtags/);
  });
});

describe("replyPrompt", () => {
  const base = { voice, networkLabel: "Instagram", contactName: "Ada", turns: [{ who: "customer" as const, text: "When do you open?" }], textMax: 2000 };

  test("grounds the reply in the thread and the saved replies", () => {
    const p = replyPrompt({ ...base, savedReplies: [{ title: "Hours", body: "We open at 7." }] });
    expect(p.user).toContain("Ada: When do you open?");
    expect(p.user).toContain("Hours: We open at 7.");
    expect(p.user).toContain("adapt it rather than writing something new");
    expect(p.user).toMatch(/never guess an answer, a refund, a delivery date, or a price/);
  });

  test("drops the saved-reply block when the workspace has none", () => {
    const p = replyPrompt({ ...base, savedReplies: [] });
    expect(p.user).not.toMatch(/saved replies for this workspace/i);
  });
});

describe("parseVariants", () => {
  test("splits on a separator line and strips model labels", () => {
    expect(parseVariants("Option 1: First draft\n---\n**Variant 2:** Second draft")).toEqual(["First draft", "Second draft"]);
  });

  test("drops empties, unwraps quotes, and caps the count", () => {
    expect(parseVariants('"one"\n---\n\n---\n2) two\n---\nthree\n---\nfour', 2)).toEqual(["one", "two"]);
  });

  test("a single unsplit answer is one variant", () => {
    expect(parseVariants("just this")).toEqual(["just this"]);
  });
});
