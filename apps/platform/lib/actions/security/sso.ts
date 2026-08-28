"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { ssoProvider } from "@/db/schema/auth";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { requireOrgAdmin } from "@/lib/org-admin";
import { workspacePath } from "@/lib/nav";
import { findSsoForEmail } from "@/lib/sso/domains";
import { buildRegisterBody, buildUpdateBody, ssoFormSchema, type SsoFormInput } from "@/lib/sso/config";
import { fail, guard, type ActionState } from "../content/shared";

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:5001";
const refresh = (workspaceId: string) => revalidatePath(workspacePath(workspaceId, "settings/sso"));

/** Better Auth throws APIError with a human message; anything else is a bug. */
function message(e: unknown, fallback: string) {
  const m = e instanceof Error ? e.message : "";
  return m && m.length < 300 ? m : fallback;
}

/**
 * Register or update the organization's SSO connection (SSO-001). Org owners
 * and admins only. Client secrets and certificates are written straight to the
 * provider row by Better Auth and are never read back into the UI or the log.
 */
export async function saveSsoProvider(input: SsoFormInput): Promise<ActionState> {
  const parsed = ssoFormSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the connection details.");
  const data = parsed.data;
  return guard(async () => {
    const ctx = await requireOrgAdmin(data.workspaceId);
    const orgId = ctx.workspace.organizationId;
    const existing = await db.query.ssoProvider.findFirst({ where: eq(ssoProvider.providerId, data.providerId) });
    if (existing && existing.organizationId !== orgId) return fail("That connection name is already taken.");
    const h = await headers();
    try {
      if (existing) await auth.api.updateSSOProvider({ headers: h, body: buildUpdateBody(data, appUrl()) });
      else await auth.api.registerSSOProvider({ headers: h, body: buildRegisterBody(data, orgId, appUrl()) });
    } catch (e) {
      return fail(message(e, "Your identity provider details were rejected. Check the issuer and endpoints."));
    }
    await audit({
      action: "sso.configure",
      actorUserId: ctx.session.user.id,
      organizationId: orgId,
      workspaceId: data.workspaceId,
      targetType: "sso_provider",
      targetId: data.providerId,
      summary: { after: { protocol: data.protocol, issuer: data.issuer, domain: data.domain, created: !existing } },
    });
    refresh(data.workspaceId);
    return { ok: existing ? "Single sign-on updated." : "Single sign-on connected." };
  });
}

/** Toggle "require SSO for this domain". Password sign-in is then refused server-side. */
export async function setSsoEnforcement(input: { workspaceId: string; providerId: string; enforced: boolean }): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireOrgAdmin(input.workspaceId);
    const row = await db.query.ssoProvider.findFirst({ where: eq(ssoProvider.providerId, input.providerId) });
    if (!row || row.organizationId !== ctx.workspace.organizationId) return fail("That connection no longer exists.");
    try {
      // `enforced` is a plugin additional field: accepted at runtime, but the
      // endpoint's inferred body type only covers the built-ins (Better Auth 1.7).
      const body = { providerId: input.providerId, enforced: input.enforced } as unknown as { providerId: string };
      await auth.api.updateSSOProvider({ headers: await headers(), body });
    } catch (e) {
      return fail(message(e, "Couldn't change enforcement. Try again."));
    }
    await audit({
      action: "sso.enforce",
      actorUserId: ctx.session.user.id,
      organizationId: ctx.workspace.organizationId,
      workspaceId: input.workspaceId,
      targetType: "sso_provider",
      targetId: input.providerId,
      summary: { before: { enforced: Boolean(row.enforced) }, after: { enforced: input.enforced } },
    });
    refresh(input.workspaceId);
    return {
      ok: input.enforced
        ? "SSO is now required for this domain. Organization owners keep password access."
        : "SSO is optional again for this domain.",
    };
  });
}

/** Remove the connection. Existing sessions survive; new SSO sign-ins stop. */
export async function removeSsoProvider(input: { workspaceId: string; providerId: string }): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireOrgAdmin(input.workspaceId);
    const row = await db.query.ssoProvider.findFirst({ where: eq(ssoProvider.providerId, input.providerId) });
    if (!row || row.organizationId !== ctx.workspace.organizationId) return fail("That connection no longer exists.");
    try {
      await auth.api.deleteSSOProvider({ headers: await headers(), body: { providerId: input.providerId } });
    } catch (e) {
      return fail(message(e, "Couldn't remove the connection. Try again."));
    }
    await audit({
      action: "sso.configure",
      actorUserId: ctx.session.user.id,
      organizationId: ctx.workspace.organizationId,
      workspaceId: input.workspaceId,
      targetType: "sso_provider",
      targetId: input.providerId,
      summary: { before: { issuer: row.issuer, domain: row.domain }, note: "removed" },
    });
    refresh(input.workspaceId);
    return { ok: "Connection removed." };
  });
}

export type SsoLookup = { providerId: string; domain: string; enforced: boolean } | null;

/**
 * Login page email-first step. Deliberately says nothing about whether the
 * account exists — only whether the *domain* has a connection.
 */
export async function lookupSso(email: string): Promise<SsoLookup> {
  if (typeof email !== "string" || email.length > 320) return null;
  const match = await findSsoForEmail(email);
  if (!match) return null;
  return { providerId: match.providerId, domain: match.domains[0] ?? "", enforced: match.enforced };
}
