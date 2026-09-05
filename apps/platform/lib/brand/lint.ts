/*
 * Pre-publish brand lint. The kit's banned words and the "quoted phrases"
 * inside its claim rules are the only parts a machine can check without
 * guessing, so those BLOCK; the rest of the kit stays guidance for the model
 * and the reviewer. Pure, so the composer, the scheduler, the API and the
 * worker share one answer.
 */
import type { ValidationIssue } from "@rocketease/providers";
import type { BrandKit } from "./types";

export type BlockedPhrase = { phrase: string; source: "banned_word" | "claim_rule"; rule: string };

/** Straight or curly quotes, 2–120 characters inside. */
const QUOTED = /["“„]([^"“”„]{2,120})["”“]/g;

/** Banned words verbatim, plus every quoted phrase inside a claim rule; first occurrence wins. */
export function blockedPhrases(kit: BrandKit): BlockedPhrase[] {
  const out: BlockedPhrase[] = [];
  const seen = new Set<string>();
  const add = (p: BlockedPhrase) => {
    const key = p.phrase.toLowerCase();
    if (!seen.has(key)) { seen.add(key); out.push(p); }
  };
  for (const w of kit.voiceRules.bannedWords) if (w.trim()) add({ phrase: w.trim(), source: "banned_word", rule: w.trim() });
  for (const rule of kit.rules.claimRules) for (const m of rule.matchAll(QUOTED)) add({ phrase: m[1].trim(), source: "claim_rule", rule });
  return out;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Case-insensitive and whole-phrase: "free" must not flag "freedom". Any whitespace in the phrase matches any run of whitespace. */
export function containsPhrase(text: string, phrase: string): boolean {
  const body = phrase.trim().split(/\s+/).map(escapeRe).join("\\s+");
  if (!body) return false;
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, "iu").test(text);
}

const reason = (p: BlockedPhrase) => (p.source === "banned_word" ? "is on the brand's banned-word list (Brand › Voice)" : `is blocked by the brand rule “${p.rule}” (Brand › Rules)`);

/** Errors for every blocked phrase found in the post text or its first comment. */
export function brandLintIssues(kit: BrandKit, input: { text: string; firstComment?: string | null }): ValidationIssue[] {
  const phrases = blockedPhrases(kit);
  if (phrases.length === 0) return [];
  const issues: ValidationIssue[] = [];
  const check = (text: string | null | undefined, field: "text" | "firstComment") => {
    if (!text) return;
    for (const p of phrases) {
      if (containsPhrase(text, p.phrase)) issues.push({ severity: "error", code: p.source === "banned_word" ? "brand_banned_word" : "brand_claim_blocked", message: `“${p.phrase}” ${reason(p)}.`, field });
    }
  };
  check(input.text, "text");
  check(input.firstComment, "firstComment");
  return issues;
}
