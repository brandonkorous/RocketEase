/*
 * Beta access decisions — pure, so the precedence rules are testable without a
 * database and without an environment.
 *
 * Precedence, most specific first:
 *   1. a stored row (an explicit revoke beats the env bootstrap)
 *   2. the BETA_FEATURES env bootstrap
 *   3. closed
 */
import type { FeatureGrantState } from "@/db/schema/features";

/** Every beta the product knows about. Adding one here is what makes it grantable. */
export const BETA_FEATURES = ["media.generation"] as const;
export type BetaFeature = (typeof BETA_FEATURES)[number];

export const isBetaFeature = (value: string): value is BetaFeature => (BETA_FEATURES as readonly string[]).includes(value);

export type GrantRow = { state: FeatureGrantState; expiresAt: Date | null };

export type AccessReason = "granted" | "granted_env" | "revoked" | "expired" | "not_granted";
export type Access = { allowed: boolean; reason: AccessReason };

/** Why access looks the way it does. Never shown to a non-beta organization (§9a: absent, not locked). */
export function decideAccess(row: GrantRow | null, envGranted: boolean, now: Date): Access {
  if (row?.state === "disabled") return { allowed: false, reason: "revoked" };
  if (row?.state === "enabled") {
    if (row.expiresAt && now >= row.expiresAt) return { allowed: false, reason: "expired" };
    return { allowed: true, reason: "granted" };
  }
  return envGranted ? { allowed: true, reason: "granted_env" } : { allowed: false, reason: "not_granted" };
}

/**
 * Bootstrap grants from the environment, so the first organization can be let
 * in before an operator surface exists:
 *   BETA_FEATURES=media.generation:org_a,media.generation:org_b
 * Unknown feature keys are ignored rather than trusted — a typo must not open
 * something, and must not close something either.
 */
export function parseBetaEnv(raw: string | undefined): Map<BetaFeature, Set<string>> {
  const out = new Map<BetaFeature, Set<string>>();
  for (const entry of (raw ?? "").split(",")) {
    const [feature, organizationId] = entry.split(":").map((s) => s.trim());
    if (!feature || !organizationId || !isBetaFeature(feature)) continue;
    const orgs = out.get(feature) ?? new Set<string>();
    orgs.add(organizationId);
    out.set(feature, orgs);
  }
  return out;
}
