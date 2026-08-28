"use server";

import { randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { ssoProvider } from "@/db/schema/auth";
import { auth } from "@/lib/auth";
import { requireWorkspace } from "@/lib/session";
import { STEP_UP_PURPOSES, stepUpMethodFor } from "@/lib/step-up";
import { encodeTicket, safeReturnTo, STEP_UP_COOKIE, STEP_UP_TICKET_SECONDS } from "@/lib/sso/step-up-ticket";
import { fail, guard, type ActionState } from "../content/shared";

const schema = z.object({
  workspaceId: z.string().min(1),
  purpose: z.enum(STEP_UP_PURPOSES),
  returnTo: z.string().max(500).optional(),
});

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:5001";

/**
 * OIDC can demand a genuine re-authentication (`prompt=login`, `max_age=0`).
 * SAML cannot: @better-auth/sso signs the AuthnRequest itself, exposes no
 * ForceAuthn option and rejects caller parameters, so a SAML IdP may satisfy
 * the round trip from its own session. The ticket records which it was.
 */
function reauthParams(isSaml: boolean) {
  return isSaml ? undefined : { prompt: "login", max_age: "0" };
}

/**
 * Starts the SSO branch of NFR-001 step-up: send the user back to their
 * identity provider and record the proof when they land on the callback.
 * Returns the IdP URL for the browser to follow.
 */
export async function beginSsoStepUp(input: z.input<typeof schema>): Promise<ActionState & { url?: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fail("Invalid verification request.");
  const { workspaceId, purpose, returnTo } = parsed.data;
  return guard(async () => {
    const ctx = await requireWorkspace(workspaceId);
    const { method, providerId } = await stepUpMethodFor(ctx.session.user.id);
    if (method !== "sso" || !providerId) return fail("Your account doesn't use single sign-on.");
    const row = await db.query.ssoProvider.findFirst({ where: eq(ssoProvider.providerId, providerId) });
    if (!row) return fail("Your single sign-on connection is no longer configured.");

    const nonce = randomBytes(24).toString("base64url");
    const target = safeReturnTo(returnTo);
    const isSaml = Boolean(row.samlConfig);
    const jar = await cookies();
    jar.set(STEP_UP_COOKIE, encodeTicket({ nonce, purpose, workspaceId, returnTo: target, forced: !isSaml }), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: STEP_UP_TICKET_SECONDS,
    });

    const callbackURL = `${appUrl()}/api/security/step-up/sso?state=${encodeURIComponent(nonce)}`;
    try {
      const res = await auth.api.signInSSO({
        headers: await headers(),
        body: {
          providerId,
          callbackURL,
          errorCallbackURL: `${appUrl()}${target}`,
          additionalParams: reauthParams(isSaml),
        },
      });
      if (!res?.url) return fail("Couldn't reach your identity provider. Try again.");
      return { ok: "Redirecting to your identity provider.", url: res.url };
    } catch {
      return fail("Couldn't reach your identity provider. Try again.");
    }
  });
}
