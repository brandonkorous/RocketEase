"use server";

import { headers } from "next/headers";
import { and, count, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditEvent } from "@/db/schema/app";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { requireWorkspace } from "@/lib/session";
import { recordStepUp, stepUpMethodFor, STEP_UP_PURPOSES } from "@/lib/step-up";
import { fail, guard, type ActionState } from "../content/shared";

const ACTION = "security.step_up";
const MAX_FAILURES = 5;
const THROTTLE_MS = 5 * 60_000;

const schema = z.object({
  workspaceId: z.string().min(1),
  purpose: z.enum(STEP_UP_PURPOSES),
  password: z.string().max(200).optional(),
  code: z.string().max(20).optional(),
});

/** Recent denied attempts by this user; blunts password guessing against a live session. */
async function tooManyFailures(userId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(auditEvent)
    .where(and(eq(auditEvent.actorUserId, userId), eq(auditEvent.action, ACTION), eq(auditEvent.result, "denied"), gt(auditEvent.createdAt, new Date(Date.now() - THROTTLE_MS))));
  return Number(row?.n ?? 0) >= MAX_FAILURES;
}

/** Password check through Better Auth's own hasher. The secret is never stored or logged. */
async function passwordOk(userId: string, password: string) {
  const c = await auth.$context;
  const account = await c.internalAdapter.findCredentialAccount(userId);
  if (!account?.password) return false;
  return c.password.verify({ hash: account.password, password });
}

/** TOTP check via the twoFactor plugin. With a live session this verifies only — it creates no new session. */
async function totpOk(code: string) {
  try {
    const r = await auth.api.verifyTOTP({ body: { code }, headers: await headers() });
    return Boolean(r);
  } catch {
    return false;
  }
}

/**
 * NFR-001 step-up: re-authenticate the *current* session before a high-risk
 * action. Password for everyone, a TOTP code when 2FA is on. Both outcomes are
 * audited as `security.step_up`.
 */
export async function verifyStepUp(input: z.input<typeof schema>): Promise<ActionState & { expiresAt?: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fail("Invalid verification request.");
  const { workspaceId, purpose, password, code } = parsed.data;
  return guard(async () => {
    const ctx = await requireWorkspace(workspaceId);
    const { session, user } = ctx.session;
    const base = { action: ACTION, actorUserId: user.id, organizationId: ctx.workspace.organizationId, workspaceId, targetType: "session", targetId: session.id };
    if (await tooManyFailures(user.id)) {
      await audit({ ...base, result: "denied", summary: { note: `${purpose}: throttled` } });
      return fail("Too many failed attempts. Wait a few minutes and try again.");
    }
    const method = await stepUpMethodFor(user.id);
    const ok = method === "totp" ? Boolean(code) && (await totpOk(code!.replace(/\s/g, ""))) : Boolean(password) && (await passwordOk(user.id, password!));
    if (!ok) {
      await audit({ ...base, result: "denied", summary: { note: `${purpose}: ${method} rejected` } });
      return fail(method === "totp" ? "That code didn't match. Check your authenticator app and try again." : "That password isn't right.");
    }
    const expiresAt = await recordStepUp({ sessionId: session.id, userId: user.id, method, purpose });
    await audit({ ...base, summary: { after: { purpose, method, expiresAt: expiresAt.toISOString() } } });
    return { ok: "Identity confirmed.", expiresAt: expiresAt.toISOString() };
  });
}
