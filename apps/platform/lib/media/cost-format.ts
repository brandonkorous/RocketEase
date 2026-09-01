/*
 * Money, as a person reads it — pure, so the rounding rule is testable without
 * a registry, a database or an environment.
 *
 * The rule that matters: generated media is often sub-cent, and two decimals
 * turn $0.0154 into "$0.02" and $0.004 into "$0.00", which reads as free. A
 * cost that reads as free is worse than no cost at all, so anything under a
 * cent keeps four decimals.
 */
const CENT = 0.01;

/** A dollar amount, or null when there is nothing honest to show. */
export function formatCostUsd(amountUsd: number | null | undefined): string | null {
  if (amountUsd === null || amountUsd === undefined || !Number.isFinite(amountUsd)) return null;
  if (amountUsd < 0) return null;
  return `$${amountUsd.toFixed(amountUsd >= CENT ? 2 : 4)}`;
}
