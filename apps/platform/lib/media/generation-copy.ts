/*
 * What the library says about a generation that did not produce a file.
 *
 * Its own module because it must be testable WITHOUT a database: the sentence
 * below is a claim about a customer's bill, and lib/media/recent.ts imports the
 * pool the moment it is loaded.
 */

/**
 * What a failed job cost, said out loud. "Nothing was charged" is a promise,
 * and a job that failed AFTER the vendor charged for it — a download past its
 * expiry, say — must not make it.
 */
export function chargeNote(credits: number | null): string {
  if (credits && credits > 0) return `${credits.toLocaleString("en-US")} credits were already charged for this one.`;
  return "Nothing was charged.";
}
