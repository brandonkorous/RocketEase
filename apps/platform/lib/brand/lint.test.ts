import { describe, expect, it } from "vitest";
import { blockedPhrases, brandLintIssues, containsPhrase } from "./lint";
import { EMPTY_KIT } from "./read";
import type { BrandKit } from "./types";

const kit = (over: { banned?: string[]; claims?: string[] } = {}): BrandKit => ({
  ...EMPTY_KIT,
  voiceRules: { ...EMPTY_KIT.voiceRules, bannedWords: over.banned ?? [] },
  rules: { ...EMPTY_KIT.rules, claimRules: over.claims ?? [] },
});

describe("blocked phrases", () => {
  it("takes banned words verbatim and only the quoted part of a claim rule", () => {
    const phrases = blockedPhrases(kit({ banned: ["synergy", " game-changing "], claims: ['No "best in the UK" claims', "No medical outcomes", "Never say “guaranteed results”"] }));
    expect(phrases.map((p) => p.phrase)).toEqual(["synergy", "game-changing", "best in the UK", "guaranteed results"]);
    expect(phrases[2]).toMatchObject({ source: "claim_rule", rule: 'No "best in the UK" claims' });
  });

  it("keeps one entry per phrase, whatever the casing", () => {
    expect(blockedPhrases(kit({ banned: ["Synergy", "synergy"] }))).toHaveLength(1);
  });
});

describe("containsPhrase", () => {
  it("is case-insensitive and whole-phrase", () => {
    expect(containsPhrase("Pure SYNERGY here", "synergy")).toBe(true);
    expect(containsPhrase("Freedom to roam", "free")).toBe(false);
    expect(containsPhrase("It's free!", "free")).toBe(true);
    expect(containsPhrase("best  in\nthe UK", "best in the UK")).toBe(true);
    expect(containsPhrase("A game-changing week", "game-changing")).toBe(true);
    expect(containsPhrase("We are #1 today", "#1")).toBe(true);
    expect(containsPhrase("Über uns", "über")).toBe(true);
    expect(containsPhrase("Überraschung", "über")).toBe(false);
  });
});

describe("brandLintIssues", () => {
  it("is silent for an empty kit and for clean text", () => {
    expect(brandLintIssues(EMPTY_KIT, { text: "synergy everywhere" })).toEqual([]);
    expect(brandLintIssues(kit({ banned: ["synergy"] }), { text: "A calm launch." })).toEqual([]);
  });

  it("blocks with an error that names the phrase and where the rule lives", () => {
    const issues = brandLintIssues(kit({ banned: ["synergy"], claims: ['No "guaranteed results"'] }), { text: "Synergy with guaranteed results", firstComment: "More synergy" });
    expect(issues.map((i) => [i.code, i.field, i.severity])).toEqual([
      ["brand_banned_word", "text", "error"],
      ["brand_claim_blocked", "text", "error"],
      ["brand_banned_word", "firstComment", "error"],
    ]);
    expect(issues[0].message).toBe("“synergy” is on the brand's banned-word list (Brand › Voice).");
    expect(issues[1].message).toBe("“guaranteed results” is blocked by the brand rule “No \"guaranteed results\"” (Brand › Rules).");
  });
});
