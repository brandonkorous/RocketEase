import { APIError, createAuthMiddleware } from "better-auth/api";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema/auth";
import { audit } from "@/lib/audit";
import { findSsoForEmail, isBreakGlassOwner } from "./domains";

const MESSAGE = "Your organization requires single sign-on. Continue with your email to reach your identity provider.";

/**
 * Server-side SSO enforcement (permissions.md: client-side hiding is never
 * authorization). When a domain's provider is marked `enforced`, password
 * sign-in for that domain is refused — except for organization owners, who
 * keep a break-glass path if the IdP is down. Denials are audited.
 */
export const blockPasswordWhenSsoEnforced = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== "/sign-in/email") return;
  const email = typeof ctx.body?.email === "string" ? ctx.body.email : "";
  if (!email) return;

  const match = await findSsoForEmail(email);
  if (!match?.enforced) return;

  const row = await db.query.user.findFirst({
    where: eq(user.email, email.trim().toLowerCase()),
    columns: { id: true },
  });
  if (row && (await isBreakGlassOwner(row.id, match.organizationId))) return;

  await audit({
    action: "auth.sso_required",
    actorUserId: row?.id ?? null,
    organizationId: match.organizationId,
    targetType: "sso_provider",
    targetId: match.providerId,
    result: "denied",
    summary: { note: `password sign-in blocked for ${match.domains.join(", ")}` },
  });
  throw new APIError("FORBIDDEN", { message: MESSAGE, code: "SSO_REQUIRED" });
});
