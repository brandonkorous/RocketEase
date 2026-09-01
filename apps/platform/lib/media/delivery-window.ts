/*
 * How long a finished render can still be collected.
 *
 * Its own DB-free module so the rule is testable: a job still running past this
 * point cannot produce a file whatever the vendor does next, so continuing to
 * poll would only keep a spinner turning over nothing (docs/bugs/B-008).
 */

/** A day. Long enough that only a genuinely stuck job trips the fallback. */
export const FALLBACK_TTL_SECONDS = 86_400;

export function deliveryWindowClosed(createdAt: Date, urlTtlSeconds?: number, now = Date.now()): boolean {
  return now - createdAt.getTime() > (urlTtlSeconds ?? FALLBACK_TTL_SECONDS) * 1000;
}
