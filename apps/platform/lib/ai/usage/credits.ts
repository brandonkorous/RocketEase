/*
 * Credit math (M8.9). One formula, in one pure place, so the meter, the ledger
 * and an invoice can never disagree: credits = output/1,000 + input/5,000.
 */

export const OUTPUT_TOKENS_PER_CREDIT = 1_000;
export const INPUT_TOKENS_PER_CREDIT = 5_000;
export const CREDIT_DECIMALS = 4;

const positive = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0);

/** Rounds to the 4 decimals the ledger column stores. */
export function roundCredits(credits: number): number {
  if (!Number.isFinite(credits)) return 0;
  return Math.round(credits * 10 ** CREDIT_DECIMALS) / 10 ** CREDIT_DECIMALS;
}

/** Credits charged for one completion. */
export function creditsFor(tokens: { inputTokens: number; outputTokens: number }): number {
  const out = positive(tokens.outputTokens) / OUTPUT_TOKENS_PER_CREDIT;
  const inp = positive(tokens.inputTokens) / INPUT_TOKENS_PER_CREDIT;
  return roundCredits(out + inp);
}

/** numeric(12,4) travels as a string — these two are the only conversions. */
export const creditsToColumn = (credits: number) => roundCredits(credits).toFixed(CREDIT_DECIMALS);
export const creditsFromColumn = (value: string | number | null | undefined) => roundCredits(Number(value ?? 0));

/** Display form: precise while small, plain once the numbers get big. */
export function formatCredits(credits: number): string {
  const c = roundCredits(credits);
  return c.toLocaleString("en-US", { maximumFractionDigits: c < 100 ? 2 : 0 });
}
