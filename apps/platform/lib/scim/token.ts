import { createHash, randomBytes } from "node:crypto";

/** Recognisable prefix so a leaked token can be spotted in logs and revoked. */
export const SCIM_TOKEN_PREFIX = "rke_scim_";

export const hashScimToken = (raw: string) => createHash("sha256").update(raw, "utf8").digest("hex");

/**
 * Mints a provisioning bearer token. The plaintext is returned once, to be
 * shown to the admin and then dropped; only the hash is ever persisted.
 */
export function mintScimToken(): { raw: string; hash: string; prefix: string } {
  const raw = `${SCIM_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  return { raw, hash: hashScimToken(raw), prefix: raw.slice(0, SCIM_TOKEN_PREFIX.length + 6) };
}

/** Bearer value from an Authorization header, or null. */
export function bearerFrom(header: string | null): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return m ? m[1] : null;
}
