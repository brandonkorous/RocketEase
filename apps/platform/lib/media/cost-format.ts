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

/*
 * The line shown beside a Generate button. Null when no rate is configured.
 *
 * "Up to", not "about": the configured rate is the CEILING's safety rate, rounded
 * up past the busiest image measured so a limit errs toward refusing. Said as
 * "about" it overstated a typical image roughly eightfold. See docs/bugs/B-004 —
 * the real fix is to estimate from recorded vendor_cost_usd instead.
 */
export function formatUnitEstimate(amountUsd: number | null | undefined): string | null {
  const money = formatCostUsd(amountUsd);
  return money && `Up to ${money} per image.`;
}
