"use server";

/*
 * Staff actions — RocketEase operating its own product.
 *
 * Deliberately narrow: organizations and beta grants, no customer content and
 * no impersonation. Every action is audited against the TARGET organization as
 * well as the actor, so a customer sees in their own audit trail that we acted
 * on their account.
 */
import { fail, guard, type ActionState } from "@/lib/actions/content/shared";
import { audit } from "@/lib/audit";
import { db } from "@/db";
import { featureGrant } from "@/db/schema/features";
import { isBetaFeature, type BetaFeature } from "@/lib/features";
import { hasEnvAdmins, requireStaff, setStaffRole, storedAdminCount } from "@/lib/staff";
import { findUserByEmail } from "@/lib/staff/queries";
import { STAFF_ROLES, type StaffRole } from "@/db/schema/staff";
import { eq } from "drizzle-orm";

/** Grant a beta to an organization, optionally time-boxed. Admin-only. */
export async function grantBeta(input: { organizationId: string; feature: string; note?: string; expiresAt?: string }): Promise<ActionState> {
  if (!isBetaFeature(input.feature)) return fail("Unknown beta.");
  const feature: BetaFeature = input.feature;
  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) return fail("That expiry date isn't valid.");
  return guard(async () => {
    const staff = await requireStaff("admin");
    await db
      .insert(featureGrant)
      .values({ organizationId: input.organizationId, feature, state: "enabled", grantedByUserId: staff.userId, note: input.note ?? null, expiresAt })
      .onConflictDoUpdate({
        target: [featureGrant.organizationId, featureGrant.feature],
        set: { state: "enabled", grantedByUserId: staff.userId, note: input.note ?? null, expiresAt, updatedAt: new Date() },
      });
    await audit({
      action: "staff.feature_grant",
      actorUserId: staff.userId,
      organizationId: input.organizationId,
      targetType: "feature_grant",
      targetId: feature,
      summary: { after: { feature, state: "enabled", expiresAt: expiresAt?.toISOString() ?? null, by: "staff" } },
    });
    return { ok: "Beta granted." };
  });
}

/** Revoke a beta. The row is kept as `disabled` so the history survives. */
export async function revokeBeta(input: { organizationId: string; feature: string }): Promise<ActionState> {
  if (!isBetaFeature(input.feature)) return fail("Unknown beta.");
  const feature: BetaFeature = input.feature;
  return guard(async () => {
    const staff = await requireStaff("admin");
    await db
      .insert(featureGrant)
      .values({ organizationId: input.organizationId, feature, state: "disabled", grantedByUserId: staff.userId })
      .onConflictDoUpdate({ target: [featureGrant.organizationId, featureGrant.feature], set: { state: "disabled", updatedAt: new Date() } });
    await audit({
      action: "staff.feature_revoke",
      actorUserId: staff.userId,
      organizationId: input.organizationId,
      targetType: "feature_grant",
      targetId: feature,
      summary: { after: { feature, state: "disabled", by: "staff" } },
    });
    return { ok: "Beta revoked." };
  });
}

export type StaffGrantRow = { organizationId: string; feature: string; state: string; expiresAt: Date | null; note: string | null };

/** Every grant, for the staff list. Metadata only — no customer content. */
export async function listGrants(feature?: string): Promise<StaffGrantRow[]> {
  await requireStaff("support");
  const q = db
    .select({
      organizationId: featureGrant.organizationId,
      feature: featureGrant.feature,
      state: featureGrant.state,
      expiresAt: featureGrant.expiresAt,
      note: featureGrant.note,
    })
    .from(featureGrant);
  const rows = feature && isBetaFeature(feature) ? await q.where(eq(featureGrant.feature, feature)) : await q;
  return rows;
}

const LAST_ADMIN =
  "That would leave no staff admin, and STAFF_EMAILS is empty — nobody could get back in. Promote someone else first.";

/**
 * Add, promote, demote or remove an operator. Admin-only.
 *
 * The last-admin guard is the point: removing the only stored admin with no
 * STAFF_EMAILS bootstrap locks everyone out of the operator surface, and the
 * only way back is SQL against production — the hole this surface exists to close.
 */
export async function setStaff(input: { email: string; role: string | null }): Promise<ActionState> {
  const role = input.role === null ? null : (STAFF_ROLES as readonly string[]).includes(input.role) ? (input.role as StaffRole) : undefined;
  if (role === undefined) return fail("Unknown staff role.");
  return guard(async () => {
    const staff = await requireStaff("admin");
    const target = await findUserByEmail(input.email);
    if (!target) return fail("No account with that email. They need to sign up first.");

    const demoting = role !== "admin";
    if (demoting && !hasEnvAdmins() && (await storedAdminCount()) <= 1) {
      const current = await db.query.staffUser.findFirst({ where: (t, { eq: e }) => e(t.userId, target.id), columns: { role: true } });
      if (current?.role === "admin") return fail(LAST_ADMIN);
    }

    await setStaffRole({ userId: target.id, role, actorUserId: staff.userId });
    await audit({
      action: role === null ? "staff.remove" : "staff.set_role",
      actorUserId: staff.userId,
      targetType: "staff_user",
      targetId: target.id,
      summary: { after: { email: target.email, role } },
    });
    return { ok: role === null ? `Removed ${target.name} from staff.` : `${target.name} is now staff ${role}.` };
  });
}
