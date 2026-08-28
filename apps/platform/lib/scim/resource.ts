import { ScimError } from "./errors";

/** Reading a SCIM User payload. No database, no tenancy — pure interpretation. */

/** "Ada Lovelace King" → given "Ada", family "Lovelace King". */
export function splitName(full: string): { givenName: string; familyName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { givenName: parts[0] ?? "", familyName: "" };
  return { givenName: parts[0], familyName: parts.slice(1).join(" ") };
}

/** SCIM sends the parts; we store one display name. */
export function joinName(payload: Record<string, unknown>): string {
  const n = (payload.name ?? {}) as Record<string, unknown>;
  const formatted = typeof n.formatted === "string" ? n.formatted.trim() : "";
  const parts = [n.givenName, n.familyName].filter((p): p is string => typeof p === "string" && Boolean(p.trim()));
  const display = typeof payload.displayName === "string" ? payload.displayName.trim() : "";
  return formatted || parts.join(" ").trim() || display || String(payload.userName ?? "").trim();
}

/**
 * SCIM `active`, defaulting to true when absent. Entra sends the string
 * `"False"`, so a strict `!== false` would silently keep a leaver enabled —
 * the one place in provisioning where a parsing slip is a security bug.
 */
export function scimActive(payload: Record<string, unknown>, fallback = true): boolean {
  const raw = payload.active;
  if (raw === undefined || raw === null) return fallback;
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") {
    const v = raw.trim().toLowerCase();
    if (v === "true" || v === "1") return true;
    if (v === "false" || v === "0" || v === "") return false;
  }
  throw new ScimError(400, `active must be a boolean, got ${JSON.stringify(raw)}`, "invalidValue");
}

/** Primary work email, falling back to the userName (which IdPs set to it). */
export function emailOf(payload: Record<string, unknown>, userName: string): string {
  const emails = Array.isArray(payload.emails) ? (payload.emails as Record<string, unknown>[]) : [];
  const primary = emails.find((e) => e?.primary === true) ?? emails[0];
  const value = typeof primary?.value === "string" ? primary.value.trim() : "";
  return (value || userName).toLowerCase();
}

/** The IdP's stable handle. Required, because everything else keys off it. */
export function requireUserName(payload: Record<string, unknown>): string {
  const raw = typeof payload.userName === "string" ? payload.userName.trim().toLowerCase() : "";
  if (!raw) throw new ScimError(400, "userName is required", "invalidValue");
  return raw;
}

export const externalIdOf = (payload: Record<string, unknown>) =>
  typeof payload.externalId === "string" && payload.externalId.trim() ? payload.externalId.trim() : null;
