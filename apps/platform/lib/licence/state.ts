/*
 * What a licence key means right now. Pure, so every state is testable.
 *
 * RocketEase's own rules (docs/plans/m14.12-self-hosted.md): an expired licence
 * keeps working for LICENCE_GRACE_DAYS with a persistent notice; after that new
 * scheduling and new workspaces stop, and everything stays readable and
 * exportable — the same shape as a lapsed cloud subscription. No key at all is
 * an evaluation, decided in lib/billing/licence-entitlements.ts.
 */
import type { LicenceCheck, LicenceFailure, LicencePayload } from "./format";

export const LICENCE_GRACE_DAYS = 30;

export type LicenceState = "licensed" | "licence_grace" | "licence_expired" | "unlicensed";

export type Licence = {
  state: LicenceState;
  payload: LicencePayload | null;
  /** Why a key that IS set cannot be used — words for the billing page, never the key. */
  reason: string | null;
  expiresAt: Date | null;
  graceUntil: Date | null;
};

export const LICENCE_FAILURE_TEXT: Record<LicenceFailure, string> = {
  malformed: "The licence key is not in the expected form. Copy it again from RocketEase.",
  unsupported: "The licence key is a newer format than this build understands. Update RocketEase.",
  bad_signature: "The licence key did not pass the signature check. Copy it again from RocketEase.",
  no_public_key: "This build has no licence public key, so no key can be checked.",
};

const NONE: Licence = { state: "unlicensed", payload: null, reason: null, expiresAt: null, graceUntil: null };

/** `check` is null when no key is set at all. */
export function licenceFrom(check: LicenceCheck | null, now: Date): Licence {
  if (!check) return NONE;
  if (!check.ok) return { ...NONE, reason: LICENCE_FAILURE_TEXT[check.reason] };
  const expiresAt = new Date(check.payload.expiresAt);
  const graceUntil = new Date(expiresAt.getTime() + LICENCE_GRACE_DAYS * 86_400_000);
  const state: LicenceState = now < expiresAt ? "licensed" : now < graceUntil ? "licence_grace" : "licence_expired";
  return { state, payload: check.payload, reason: null, expiresAt, graceUntil };
}

/** Features the licence grants while it is in force (grace included; expired grants nothing). */
export const licenceFeatures = (l: Licence): string[] => (l.state === "licensed" || l.state === "licence_grace" ? (l.payload?.features ?? []) : []);
