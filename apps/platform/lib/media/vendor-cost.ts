/*
 * What a job actually cost US — our cost of goods, and what the monthly
 * ceiling accrues against.
 *
 * Two vendors, two ways of telling us. An image model meters TOKENS, so the
 * adapter turns them into dollars and the figure arrives already computed.
 * Sora meters NOTHING: the completed video object carries `seconds` and no
 * usage block at all. It bills per second, so the seconds it echoes back times
 * the configured rate IS the invoice — arithmetic on a reported quantity, the
 * same shape as tokens times a token rate, not an estimate of the request.
 *
 * The distinction that matters: the quantity must be the one the VENDOR
 * reported, never the one we asked for. A clip that comes back shorter than
 * requested is billed at what arrived.
 *
 * Null when it genuinely cannot be known — never 0, which would silently
 * disarm the ceiling (docs/bugs/B-009).
 */

export function vendorCostUsd(
  reported: number | null | undefined,
  quantity: number | null | undefined,
  rate: number | null | undefined,
): number | null {
  if (reported !== null && reported !== undefined) return reported;
  if (!quantity || quantity <= 0) return null;
  if (rate === null || rate === undefined) return null;
  return Math.round(rate * quantity * 1e6) / 1e6;
}
