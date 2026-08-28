import "server-only";
import { and, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { member, ssoProvider } from "@/db/schema/auth";

/** A configured SSO connection, flattened for the login and settings screens. */
export type SsoMatch = {
  id: string;
  providerId: string;
  organizationId: string | null;
  issuer: string;
  domains: string[];
  enforced: boolean;
  protocol: "oidc" | "saml";
};

/** Lowercased domain part of an email address, or null when it isn't one. */
export function emailDomain(email: string): string | null {
  const at = email.trim().toLowerCase().lastIndexOf("@");
  if (at < 1 || at === email.trim().length - 1) return null;
  return email.trim().toLowerCase().slice(at + 1);
}

/** The `domain` column holds a comma-separated list for multi-domain enterprises. */
export function parseDomains(value: string): string[] {
  return value
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

type Row = typeof ssoProvider.$inferSelect;

function toMatch(row: Row): SsoMatch {
  return {
    id: row.id,
    providerId: row.providerId,
    organizationId: row.organizationId,
    issuer: row.issuer,
    domains: parseDomains(row.domain),
    enforced: Boolean(row.enforced),
    protocol: row.samlConfig ? "saml" : "oidc",
  };
}

/** The provider configured for this email's domain, or null. Exact match only. */
export async function findSsoForEmail(email: string): Promise<SsoMatch | null> {
  const domain = emailDomain(email);
  if (!domain) return null;
  const rows = await db
    .select()
    .from(ssoProvider)
    .where(or(eq(ssoProvider.domain, domain), sql`${ssoProvider.domain} ilike ${`%${domain}%`}`));
  return rows.map(toMatch).find((m) => m.domains.includes(domain)) ?? null;
}

/** Every connection an organization has registered. */
export async function listOrgProviders(organizationId: string): Promise<SsoMatch[]> {
  const rows = await db.select().from(ssoProvider).where(eq(ssoProvider.organizationId, organizationId));
  return rows.map(toMatch);
}

/**
 * Break-glass: an organization owner keeps password sign-in even under an
 * enforced domain, so a broken IdP can never lock the org out of its own
 * account (permissions.md "High-risk actions" — recovery must stay possible).
 */
export async function isBreakGlassOwner(userId: string, organizationId: string | null): Promise<boolean> {
  if (!organizationId) return false;
  const row = await db.query.member.findFirst({
    where: and(eq(member.userId, userId), eq(member.organizationId, organizationId), eq(member.role, "owner")),
  });
  return Boolean(row);
}
