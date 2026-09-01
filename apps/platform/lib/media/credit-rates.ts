/*
 * Credits for media that reports no tokens.
 *
 * The token formula (lib/ai/usage/credits.ts) is the product's definition of a
 * credit, and it works for anything a language model bills. Sora reports no
 * usage at all — its video object carries `seconds` and nothing else — so a
 * video would be silently unbilled under that formula alone.
 *
 * So a deployment configures credits per BILLED UNIT, the same shape and the
 * same discipline as AI_MEDIA_RATES_JSON: unset means unpriced, and unpriced
 * means null rather than a guessed zero. What a second of video should be worth
 * in credits is a pricing decision, deliberately not one this file makes.
 */
import { roundCredits } from "@/lib/ai/usage/credits";

/** Parsed from AI_MEDIA_CREDIT_RATES_JSON, keyed on model key. */
export function parseCreditRates(raw: string | undefined, warn: (m: string) => void = () => {}): Record<string, number> {
  if (!raw?.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    warn("AI_MEDIA_CREDIT_RATES_JSON is not valid JSON; media generation stays uncharged");
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[k] = v;
    else warn(`AI_MEDIA_CREDIT_RATES_JSON: ${k} is not a usable rate; that model stays uncharged`);
  }
  return out;
}

/**
 * Credits for a job billed in its own unit. Null when there is no rate or no
 * quantity — an unmeasured job is not one we may invent a charge for.
 */
export function creditsForQuantity(modelKey: string, quantity: number | null | undefined, rates: Record<string, number>): number | null {
  const rate = rates[modelKey];
  if (rate === undefined) return null;
  if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0) return null;
  return roundCredits(rate * quantity);
}
