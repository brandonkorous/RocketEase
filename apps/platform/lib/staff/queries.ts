import "server-only";
import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { organization, user } from "@/db/schema/auth";
import { workspace } from "@/db/schema/app";
import { featureGrant } from "@/db/schema/features";
import { staffUser, type StaffRole } from "@/db/schema/staff";
import { describeGrants, type GrantDescription } from "@/lib/features";

export type StaffOrgRow = {
  id: string;
  name: string;
  slug: string | null;
  createdAt: Date;
  workspaces: number;
  /** One entry per known beta, so the table has no gaps to interpret. */
  betas: GrantDescription[];
};

/**
 * Operational metadata only — organizations, their size, and their beta grants.
 * Deliberately reads no customer content: there is no staff path into a tenant.
 */
export async function listStaffOrganizations(now = new Date()): Promise<StaffOrgRow[]> {
  const [orgs, counts, grants] = await Promise.all([
    db.select({ id: organization.id, name: organization.name, slug: organization.slug, createdAt: organization.createdAt }).from(organization).orderBy(organization.name),
    db.select({ organizationId: workspace.organizationId, n: count() }).from(workspace).groupBy(workspace.organizationId),
    db.select().from(featureGrant),
  ]);

  const sizeOf = new Map(counts.map((c) => [c.organizationId, Number(c.n)]));
  const grantsByOrg = new Map<string, typeof grants>();
  for (const g of grants) grantsByOrg.set(g.organizationId, [...(grantsByOrg.get(g.organizationId) ?? []), g]);

  return orgs.map((o) => ({
    id: o.id,
    name: o.name,
    slug: o.slug ?? null,
    createdAt: o.createdAt,
    workspaces: sizeOf.get(o.id) ?? 0,
    betas: describeGrants(o.id, grantsByOrg.get(o.id) ?? [], now),
  }));
}

/** Grants for one organization, for a future detail view. */
export async function grantsForOrganization(organizationId: string) {
  return db.select().from(featureGrant).where(eq(featureGrant.organizationId, organizationId));
}

export type StaffMemberRow = { userId: string; name: string; email: string; role: StaffRole; note: string | null; createdAt: Date };

/** Stored operators. Bootstrap addresses from STAFF_EMAILS are not rows and do not appear here. */
export async function listStaff(): Promise<StaffMemberRow[]> {
  return db
    .select({ userId: staffUser.userId, name: user.name, email: user.email, role: staffUser.role, note: staffUser.note, createdAt: staffUser.createdAt })
    .from(staffUser)
    .innerJoin(user, eq(user.id, staffUser.userId))
    .orderBy(user.name);
}

/** Resolve a person by email so an operator can be added without knowing their id. */
export async function findUserByEmail(email: string): Promise<{ id: string; name: string; email: string } | null> {
  const row = await db.query.user.findFirst({
    where: (u, { eq: e, sql }) => e(sql`lower(${u.email})`, email.trim().toLowerCase()),
    columns: { id: true, name: true, email: true },
  });
  return row ?? null;
}
