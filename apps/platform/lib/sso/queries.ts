import "server-only";
import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { auditEvent, scimIdentity, scimToken } from "@/db/schema/app";
import { ssoProvider, user } from "@/db/schema/auth";
import { isOrgAdmin, orgRoleOf } from "@/lib/org-admin";
import { scimBaseUrl } from "@/lib/scim/constants";
import type { WorkspaceContext } from "@/lib/session";
import { formatInZone } from "@/lib/time";
import { listOrgProviders, type SsoMatch } from "./domains";

export type ScimTokenView = { prefix: string; createdAt: string; lastUsedAt: string | null };
export type SsoActivityRow = { id: string; action: string; at: string; detail: string };

export type SsoSectionData = {
  canManage: boolean;
  organizationName: string;
  connections: SsoMatch[];
  scim: { baseUrl: string; token: ScimTokenView | null; provisionedUsers: number };
  activity: SsoActivityRow[];
};

export const EMPTY_SSO: SsoSectionData = {
  canManage: false,
  organizationName: "",
  connections: [],
  scim: { baseUrl: "", token: null, provisionedUsers: 0 },
  activity: [],
};

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:5001";

/** Everything the enterprise-auth section shows, in one round of queries. */
const ACTIONS = ["sso.configure", "sso.enforce", "scim.token.rotate", "scim.user.provisioned", "scim.user.deprovisioned", "scim.group.updated", "auth.sso_required"];

/** One readable line per audit row — actor and target, never a secret. */
function detailOf(row: { action: string; targetId: string | null; actorName: string | null; summary: unknown }): string {
  const who = row.actorName ?? "Provisioning";
  const target = row.targetId ? ` · ${row.targetId}` : "";
  const note = (row.summary as { note?: string } | null)?.note;
  return `${who}${target}${note && !note.startsWith("scim token") ? ` · ${note}` : ""}`;
}

export async function ssoSectionData(ctx: WorkspaceContext): Promise<SsoSectionData> {
  const orgId = ctx.workspace.organizationId;
  const role = await orgRoleOf(orgId, ctx.session.user.id);
  const organizationName = ctx.workspace.organizationName;
  // Enterprise auth belongs to the billing boundary: a workspace member who
  // isn't an org owner/admin sees that the section exists and nothing else.
  if (!isOrgAdmin(role)) return { ...EMPTY_SSO, organizationName };
  const tz = ctx.workspace.timezone;
  const [connections, token, [{ n }], events] = await Promise.all([
    listOrgProviders(orgId),
    db.query.scimToken.findFirst({ where: and(eq(scimToken.organizationId, orgId), isNull(scimToken.revokedAt)) }),
    db.select({ n: count() }).from(scimIdentity).where(and(eq(scimIdentity.organizationId, orgId), eq(scimIdentity.active, true))),
    db
      .select({ id: auditEvent.id, action: auditEvent.action, createdAt: auditEvent.createdAt, targetId: auditEvent.targetId, summary: auditEvent.summary, actorName: user.name })
      .from(auditEvent)
      .leftJoin(user, eq(user.id, auditEvent.actorUserId))
      .where(and(eq(auditEvent.organizationId, orgId), inArray(auditEvent.action, ACTIONS)))
      .orderBy(desc(auditEvent.createdAt))
      .limit(20),
  ]);
  const stamp = (d: Date) => formatInZone(d, tz, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return {
    canManage: true,
    organizationName,
    connections,
    scim: {
      baseUrl: scimBaseUrl(appUrl()),
      token: token ? { prefix: token.prefix, createdAt: stamp(token.createdAt), lastUsedAt: token.lastUsedAt ? stamp(token.lastUsedAt) : null } : null,
      provisionedUsers: Number(n),
    },
    activity: events.map((e) => ({ id: e.id, action: e.action, at: stamp(e.createdAt), detail: detailOf(e) })),
  };
}

export type OrgSecurity = { ssoEnforced: boolean; connections: number; scimActive: boolean };

/** One-line enterprise-auth posture per organization, for the agency overview. */
export async function orgSecurity(organizationIds: string[]): Promise<Map<string, OrgSecurity>> {
  const ids = [...new Set(organizationIds)];
  const out = new Map<string, OrgSecurity>();
  if (!ids.length) return out;
  const [providers, tokens] = await Promise.all([
    db.select({ organizationId: ssoProvider.organizationId, enforced: ssoProvider.enforced }).from(ssoProvider).where(inArray(ssoProvider.organizationId, ids)),
    db.select({ organizationId: scimToken.organizationId }).from(scimToken).where(and(inArray(scimToken.organizationId, ids), isNull(scimToken.revokedAt))),
  ]);
  for (const id of ids) {
    const mine = providers.filter((p) => p.organizationId === id);
    out.set(id, {
      ssoEnforced: mine.some((p) => p.enforced),
      connections: mine.length,
      scimActive: tokens.some((t) => t.organizationId === id),
    });
  }
  return out;
}
