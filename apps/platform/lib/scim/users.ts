import "server-only";
import { and, asc, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { scimIdentity } from "@/db/schema/scim";
import { user } from "@/db/schema/auth";
import { SCIM_SCHEMA, scimBaseUrl } from "./constants";
import { stringTerm, boolTerm, type ScimFilterTerm } from "./filter";
import { ScimError } from "./errors";
import { splitName } from "./resource";

export type UserRow = {
  userId: string;
  userName: string;
  externalId: string | null;
  active: boolean;
  name: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
};

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:5001";

export function toScimUser(row: UserRow): Record<string, unknown> {
  const { givenName, familyName } = splitName(row.name);
  return {
    schemas: [SCIM_SCHEMA.user],
    id: row.userId,
    ...(row.externalId ? { externalId: row.externalId } : {}),
    userName: row.userName,
    name: { formatted: row.name, givenName, familyName },
    displayName: row.name,
    emails: [{ value: row.email, type: "work", primary: true }],
    active: row.active,
    meta: {
      resourceType: "User",
      created: row.createdAt.toISOString(),
      lastModified: row.updatedAt.toISOString(),
      location: `${scimBaseUrl(appUrl())}/Users/${row.userId}`,
    },
  };
}

const columns = {
  userId: scimIdentity.userId,
  userName: scimIdentity.userName,
  externalId: scimIdentity.externalId,
  active: scimIdentity.active,
  name: user.name,
  email: user.email,
  createdAt: scimIdentity.createdAt,
  updatedAt: scimIdentity.updatedAt,
};

/** Filter terms → a WHERE clause. An unsupported attribute is an error, not a silent match-all. */
function whereFor(organizationId: string, terms: ScimFilterTerm[]) {
  const known = new Set(["username", "externalid", "active", "id", "value"]);
  const unknown = terms.find((t) => !known.has(t.attr));
  if (unknown) throw new ScimError(400, `Filtering on ${unknown.attr} is not supported`, "invalidFilter");
  const userName = stringTerm(terms, "userName");
  const externalId = stringTerm(terms, "externalId");
  const id = stringTerm(terms, "id") ?? stringTerm(terms, "value");
  const active = boolTerm(terms, "active");
  return and(
    eq(scimIdentity.organizationId, organizationId),
    ...(userName ? [eq(scimIdentity.userName, userName.toLowerCase())] : []),
    ...(externalId ? [eq(scimIdentity.externalId, externalId)] : []),
    ...(id ? [eq(scimIdentity.userId, id)] : []),
    ...(active === undefined ? [] : [eq(scimIdentity.active, active)]),
  );
}

/** One page of provisioned users plus the unpaged total, for a ListResponse. */
export async function listUsers(
  organizationId: string,
  terms: ScimFilterTerm[],
  paging: { offset: number; count: number },
): Promise<{ total: number; rows: UserRow[] }> {
  const where = whereFor(organizationId, terms);
  const [{ n }] = await db.select({ n: count() }).from(scimIdentity).where(where);
  if (paging.count === 0) return { total: Number(n), rows: [] };
  const rows = await db
    .select(columns)
    .from(scimIdentity)
    .innerJoin(user, eq(user.id, scimIdentity.userId))
    .where(where)
    .orderBy(asc(scimIdentity.userName))
    .limit(paging.count)
    .offset(paging.offset);
  return { total: Number(n), rows };
}

export async function findUser(organizationId: string, id: string): Promise<UserRow | null> {
  const [row] = await db
    .select(columns)
    .from(scimIdentity)
    .innerJoin(user, eq(user.id, scimIdentity.userId))
    .where(and(eq(scimIdentity.organizationId, organizationId), eq(scimIdentity.userId, id)))
    .limit(1);
  return row ?? null;
}

export async function findUserByName(organizationId: string, userName: string): Promise<UserRow | null> {
  const [row] = await db
    .select(columns)
    .from(scimIdentity)
    .innerJoin(user, eq(user.id, scimIdentity.userId))
    .where(and(eq(scimIdentity.organizationId, organizationId), eq(scimIdentity.userName, userName.toLowerCase())))
    .limit(1);
  return row ?? null;
}

/** RFC 7644 §3.4.2 ListResponse envelope. */
export function listResponse(resources: unknown[], total: number, startIndex: number) {
  return {
    schemas: [SCIM_SCHEMA.listResponse],
    totalResults: total,
    startIndex,
    itemsPerPage: resources.length,
    Resources: resources,
  };
}
