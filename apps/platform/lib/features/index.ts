/*
 * Beta feature grants — the read path.
 *
 * No `server-only` import: the worker checks grants too, and worker code must
 * not pull in server-only or next/headers (see lib/audit.ts for the pattern).
 *
 * Default closed. A beta that leaks by default is not a beta.
 */
import { db } from "@/db";
import { featureGrant } from "@/db/schema/features";
import { BETA_FEATURES, decideAccess, parseBetaEnv, type Access, type BetaFeature } from "./policy";

export { BETA_FEATURES, isBetaFeature, type BetaFeature } from "./policy";
export type { Access, AccessReason } from "./policy";

let cache: { raw: string; grants: Map<BetaFeature, Set<string>> } | null = null;

function envGrants(): Map<BetaFeature, Set<string>> {
  const raw = process.env.BETA_FEATURES ?? "";
  if (cache?.raw !== raw) cache = { raw, grants: parseBetaEnv(raw) };
  return cache.grants;
}

/** The stored row for one organization and beta, or null. */
async function grantRow(organizationId: string, feature: BetaFeature) {
  const row = await db.query.featureGrant.findFirst({
    where: (g, { and: a, eq: e }) => a(e(g.organizationId, organizationId), e(g.feature, feature)),
    columns: { state: true, expiresAt: true },
  });
  return row ?? null;
}

/** Full decision, for the few places that need to distinguish revoked from expired. */
export async function featureAccess(organizationId: string, feature: BetaFeature, now = new Date()): Promise<Access> {
  const envGranted = envGrants().get(feature)?.has(organizationId) ?? false;
  return decideAccess(await grantRow(organizationId, feature), envGranted, now);
}

/** The check every entry point makes. Server-side, never only in the UI. */
export async function hasFeature(organizationId: string, feature: BetaFeature): Promise<boolean> {
  return (await featureAccess(organizationId, feature)).allowed;
}

/**
 * Whether an organization may opt itself back in. Betas are invite-only: you can
 * leave one you were invited to and rejoin it, but you cannot grant yourself one.
 */
export async function isInvited(organizationId: string, feature: BetaFeature): Promise<boolean> {
  if (envGrants().get(feature)?.has(organizationId)) return true;
  return (await grantRow(organizationId, feature)) !== null;
}

/** Upsert used by the opt-out/opt-in action. Granting a new organization is operator-side. */
export async function setParticipation(input: {
  organizationId: string;
  feature: BetaFeature;
  participate: boolean;
  actorUserId: string;
  note?: string;
}): Promise<void> {
  const state = input.participate ? "enabled" : "disabled";
  await db
    .insert(featureGrant)
    .values({
      organizationId: input.organizationId,
      feature: input.feature,
      state,
      grantedByUserId: input.actorUserId,
      note: input.note ?? null,
    })
    .onConflictDoUpdate({
      target: [featureGrant.organizationId, featureGrant.feature],
      set: { state, updatedAt: new Date() },
    });
}

export type GrantDescription = {
  feature: BetaFeature;
  state: "enabled" | "disabled" | null;
  expiresAt: Date | null;
  allowed: boolean;
  reason: Access["reason"];
};

/**
 * Every known beta decided for one organization, whether or not a row exists —
 * so an operator list has no gaps to interpret. Rows are passed in so a listing
 * page can fetch them once for many organizations.
 */
export function describeGrants(
  organizationId: string,
  rows: { feature: string; state: "enabled" | "disabled"; expiresAt: Date | null }[],
  now = new Date(),
): GrantDescription[] {
  const byFeature = new Map(rows.map((r) => [r.feature, r]));
  return BETA_FEATURES.map((feature) => {
    const row = byFeature.get(feature) ?? null;
    const access = decideAccess(row, envGrants().get(feature)?.has(organizationId) ?? false, now);
    return { feature, state: row?.state ?? null, expiresAt: row?.expiresAt ?? null, ...access };
  });
}

/** Test seam: forget the parsed env between cases. */
export const __resetFeatureCache = () => {
  cache = null;
};
