import type { HealthReport } from "./types";
import { ProviderError } from "./types";

/*
 * Shared helpers for adapter healthCheck implementations: compare granted vs
 * required scopes and turn a probe outcome into a HealthReport without
 * throwing for the expected (permission) failure modes.
 */

export const missingScopes = (granted: string[], required: string[]) => required.filter((s) => !granted.includes(s));

/** Run a cheap read; permission errors → tokenOk=false, anything else rethrows. */
export async function probe(required: string[], granted: string[], read: () => Promise<unknown>): Promise<HealthReport> {
  const missing = missingScopes(granted, required);
  try {
    await read();
  } catch (err) {
    if (err instanceof ProviderError && err.category === "permission") {
      return { tokenOk: false, permissionsOk: false, missingScopes: missing, message: err.message };
    }
    if (err instanceof ProviderError && err.category === "deleted") {
      return { tokenOk: true, permissionsOk: false, missingScopes: missing, message: err.message };
    }
    throw err;
  }
  return { tokenOk: true, permissionsOk: missing.length === 0, missingScopes: missing, message: missing.length ? `Missing permissions: ${missing.join(", ")}` : undefined };
}

/** Parse a Retry-After header (seconds or HTTP date) into seconds. */
export function retryAfterSeconds(headers: Headers | undefined, fallback?: number): number | undefined {
  const v = headers?.get("retry-after");
  if (!v) return fallback;
  const n = Number(v);
  if (Number.isFinite(n)) return Math.max(0, Math.round(n));
  const t = Date.parse(v);
  return Number.isNaN(t) ? fallback : Math.max(0, Math.round((t - Date.now()) / 1000));
}
