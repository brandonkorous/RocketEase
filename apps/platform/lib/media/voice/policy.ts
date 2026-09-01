/*
 * May this voice be used, for this, right now?
 *
 * Pure. Takes a row and a moment, returns a decision with a reason a person can
 * act on. Kept separate from the database so the rule is testable without
 * fixtures — which is the only way a rule about somebody's voice stays honest.
 *
 * The premise (docs/research/ai-media-2026.md §8): the vendors' consent checks
 * verify the UPLOADER. ElevenLabs' captcha proves the person recording is the
 * person speaking; in an agency, the employee cloning a client's founder passes
 * it and has no consent whatsoever. Tennessee's ELVIS Act already makes an
 * unauthorised replica actionable without any deception at all, and the NO FAKES
 * Act is still only a bill — so we plan around the strictest live rule.
 *
 * Stock voices need none of this. That asymmetry is the whole design.
 */
import type { ConsentScope, VoiceKind } from "@/db/schema/voice";

/** Exactly the columns the decision reads. */
export type ConsentRow = {
  kind: VoiceKind;
  label: string;
  consentPersonName: string | null;
  consentEvidenceAssetId: string | null;
  authorisedByUserId: string | null;
  authorisedAt: Date | null;
  expiresAt: Date | null;
  scope: ConsentScope;
  revokedAt: Date | null;
};

/** What the voice is about to be used for. Paid usage needs paid consent. */
export type UsageScope = "organic" | "paid";

export type ConsentDecision =
  | { allowed: true; reason: "stock" | "consented" }
  | { allowed: false; code: ConsentDenial; message: string };

export type ConsentDenial =
  | "revoked"
  | "incomplete"
  | "expired"
  | "out_of_scope"
  | "unknown_kind";

const MISSING_LABELS: Record<string, string> = {
  consentPersonName: "whose voice this is",
  consentEvidenceAssetId: "the signed release or recording",
  authorisedByUserId: "who authorised it",
  authorisedAt: "when it was authorised",
  expiresAt: "when the consent runs out",
};

/** Every part that must be present before a replica is usable at all. */
export function missingConsentFields(row: ConsentRow): string[] {
  const required: (keyof ConsentRow)[] = [
    "consentPersonName",
    "consentEvidenceAssetId",
    "authorisedByUserId",
    "authorisedAt",
    "expiresAt",
  ];
  return required.filter((f) => !row[f]).map((f) => MISSING_LABELS[f] ?? String(f));
}

const scopeCovers = (granted: ConsentScope, needed: UsageScope) => granted === "both" || granted === needed;

/**
 * A stock voice is always allowed. Everything else needs a complete, unexpired,
 * unrevoked record whose scope covers the use.
 */
export function decideConsent(row: ConsentRow, usage: UsageScope, now: Date): ConsentDecision {
  if (row.kind === "stock") return { allowed: true, reason: "stock" };
  if (row.kind !== "cloned" && row.kind !== "likeness") {
    return { allowed: false, code: "unknown_kind", message: `“${row.label}” has an unrecognised voice type and cannot be used.` };
  }

  if (row.revokedAt && row.revokedAt <= now) {
    return { allowed: false, code: "revoked", message: `Consent for “${row.label}” was withdrawn and cannot be used again.` };
  }

  const missing = missingConsentFields(row);
  if (missing.length) {
    return {
      allowed: false,
      code: "incomplete",
      message: `“${row.label}” has no complete consent record — still missing ${missing.join(", ")}.`,
    };
  }

  // Non-null after the completeness check above.
  if (row.expiresAt! <= now) {
    return { allowed: false, code: "expired", message: `Consent for “${row.label}” expired on ${row.expiresAt!.toISOString().slice(0, 10)}.` };
  }

  if (!scopeCovers(row.scope, usage)) {
    return {
      allowed: false,
      code: "out_of_scope",
      message: `Consent for “${row.label}” covers ${row.scope} use only, and this is ${usage} usage.`,
    };
  }

  return { allowed: true, reason: "consented" };
}

/** Days left, for the nightly expiry warning. Null when nothing is clocked. */
export function consentDaysLeft(row: ConsentRow, now: Date): number | null {
  if (row.kind === "stock" || !row.expiresAt) return null;
  return Math.floor((row.expiresAt.getTime() - now.getTime()) / 86_400_000);
}

/** True when a replica needs the owner-level enablement, not just a role check. */
export const needsOwnerAuthorisation = (kind: VoiceKind): boolean => kind !== "stock";
