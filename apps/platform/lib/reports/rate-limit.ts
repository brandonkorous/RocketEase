/*
 * Fixed-window limiter for the public share routes.
 *
 * Per process and in memory: enough to blunt token guessing and hot-linking on
 * a single node. A shared limiter belongs in Redis when the app runs more than
 * one replica — until then this must never be the only defence, which is why
 * tokens are HMAC-signed and checked before any database read.
 */
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 5000;

export type RateLimitResult = { ok: boolean; retryAfterSeconds: number };

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    if (buckets.size > MAX_KEYS) buckets.clear();
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSeconds: 0 };
  }
  existing.count += 1;
  if (existing.count > limit) return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
  return { ok: true, retryAfterSeconds: 0 };
}

/** Test seam. */
export const resetRateLimits = () => buckets.clear();
