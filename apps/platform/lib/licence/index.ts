/*
 * The install's licence, read from the environment and checked offline. No
 * `server-only`: the worker and the health route ask too.
 */
import { verifyLicence, type LicenceCheck } from "./format";
import { DEFAULT_LICENCE_PUBLIC_KEY } from "./public-key";
import { licenceFrom, type Licence } from "./state";

export { LICENCE_GRACE_DAYS, licenceFeatures, type Licence, type LicenceState } from "./state";
export type { LicencePayload } from "./format";

let cache: { key: string; pub: string | null; check: LicenceCheck | null } | null = null;

/** Verified once per distinct key; the state (expiry, grace) is recomputed for `now` on every call. */
export function currentLicence(now = new Date()): Licence {
  const key = process.env.LICENCE_KEY?.trim() ?? "";
  const pub = process.env.LICENCE_PUBLIC_KEY?.trim() || DEFAULT_LICENCE_PUBLIC_KEY || null;
  if (cache?.key !== key || cache.pub !== pub) cache = { key, pub, check: key ? verifyLicence(key, pub) : null };
  return licenceFrom(cache.check, now);
}

/** True when a key is set at all (valid or not) — the billing page words differ. */
export const licenceKeySet = () => Boolean(process.env.LICENCE_KEY?.trim());
