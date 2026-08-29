/*
 * Model prices — configuration, not data, which is why there is no `ai_price`
 * table. PLACEHOLDER: this repo ships no real per-token rates and never invents
 * one. Supply them per deployment in AI_PRICES_JSON, e.g.
 *
 *   AI_PRICES_JSON={"claude-sonnet-5":{"inputPerMTok":0,"outputPerMTok":0}}
 *
 * With nothing configured `costUsd` stays null everywhere and credits are the
 * only billed unit.
 */
import { log } from "@/lib/log";

export type ModelPrice = { inputPerMTok: number; outputPerMTok: number };

/** Models we know we call. Listed as PLACEHOLDER — no rate until one is configured. */
export const PLACEHOLDER_PRICE_MODELS = ["claude-sonnet-5"] as const;

const PER_MTOK = 1_000_000;
export const COST_DECIMALS = 6;

const rate = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);

function parsePrices(raw: string): Record<string, ModelPrice> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    log.warn("AI_PRICES_JSON is not valid JSON; AI usage stays unpriced");
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const out: Record<string, ModelPrice> = {};
  for (const [model, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!model || !value || typeof value !== "object") continue;
    const v = value as Record<string, unknown>;
    const inputPerMTok = rate(v.inputPerMTok) ?? rate(v.input);
    const outputPerMTok = rate(v.outputPerMTok) ?? rate(v.output);
    if (inputPerMTok === null || outputPerMTok === null) continue;
    out[model] = { inputPerMTok, outputPerMTok };
  }
  return out;
}

let cache: { raw: string; prices: Record<string, ModelPrice> } | null = null;

export function aiPrices(): Record<string, ModelPrice> {
  const raw = (process.env.AI_PRICES_JSON ?? "").trim();
  if (!raw) return {};
  if (cache?.raw !== raw) cache = { raw, prices: parsePrices(raw) };
  return cache.prices;
}

export const priceFor = (model: string): ModelPrice | null => aiPrices()[model] ?? null;

/** USD for one completion, or null when the model has no configured price. */
export function costUsdFor(model: string, tokens: { inputTokens: number; outputTokens: number }): number | null {
  const price = priceFor(model);
  if (!price) return null;
  const input = Math.max(0, tokens.inputTokens) * price.inputPerMTok;
  const output = Math.max(0, tokens.outputTokens) * price.outputPerMTok;
  return Math.round(((input + output) / PER_MTOK) * 10 ** COST_DECIMALS) / 10 ** COST_DECIMALS;
}
