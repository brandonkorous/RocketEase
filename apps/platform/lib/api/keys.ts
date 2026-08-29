/*
 * Public API credentials. Only the SHA-256 of a key is ever stored; the
 * plaintext is shown once at creation (same contract as the SCIM token).
 */
import { createHash, randomBytes } from "node:crypto";
import { CAPABILITIES, capabilitiesOf, type Capability, type Principal } from "@/lib/authz";

/** Recognisable prefix so a leaked key is greppable in logs and revocable. */
export const API_KEY_PREFIX = "mis_";

export const hashApiKey = (raw: string) => createHash("sha256").update(raw, "utf8").digest("hex");

export function mintApiKey(): { raw: string; hash: string; prefix: string } {
  const raw = `${API_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
  return { raw, hash: hashApiKey(raw), prefix: raw.slice(0, API_KEY_PREFIX.length + 6) };
}

/** Bearer value from an Authorization header, or null. */
export function bearerFrom(header: string | null): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return m ? m[1] : null;
}

const isCapability = (s: string): s is Capability => (CAPABILITIES as readonly string[]).includes(s);

/**
 * A key never widens its creator: requested scopes are intersected with what
 * the creator can do outright. `policy`/`assigned` capabilities resolve at
 * request time, so they are not grantable to a key here.
 */
export function resolveScopes(requested: string[], creator: Principal): Capability[] {
  const own = new Set(capabilitiesOf(creator));
  return [...new Set(requested.filter(isCapability))].filter((c) => own.has(c));
}

/** Scopes that were asked for but the creator cannot grant (for a precise error). */
export function rejectedScopes(requested: string[], creator: Principal): string[] {
  const granted = new Set<string>(resolveScopes(requested, creator));
  return [...new Set(requested)].filter((c) => !granted.has(c));
}
