import "server-only";
import { and, eq, gt, lt } from "drizzle-orm";
import { db } from "@/db";
import { stepUpVerification } from "@/db/schema/app";
import { user } from "@/db/schema/auth";

/** How long a re-authentication stays valid (NFR-001: minutes, not hours). */
export const STEP_UP_WINDOW_MS = 5 * 60_000;

/** Only paid spend needs step-up today; add purposes as high-risk actions land. */
export const STEP_UP_PURPOSES = ["paid_spend"] as const;
export type StepUpPurpose = (typeof STEP_UP_PURPOSES)[number];
export type StepUpMethod = "password" | "totp";
export type StepUpChallenge = { method: StepUpMethod; fresh: boolean; windowMinutes: number };

/** A user with 2FA on proves identity with a code; everyone else with their password. */
export async function stepUpMethodFor(userId: string): Promise<StepUpMethod> {
  const row = await db.query.user.findFirst({ where: eq(user.id, userId), columns: { twoFactorEnabled: true } });
  return row?.twoFactorEnabled ? "totp" : "password";
}

/** True when this session re-authenticated for `purpose` inside the window. */
export async function hasFreshStepUp(sessionId: string, purpose: StepUpPurpose): Promise<boolean> {
  const row = await db.query.stepUpVerification.findFirst({
    where: and(eq(stepUpVerification.sessionId, sessionId), eq(stepUpVerification.purpose, purpose), gt(stepUpVerification.expiresAt, new Date())),
  });
  return Boolean(row);
}

/** Records a successful re-authentication and prunes anything already expired. */
export async function recordStepUp(input: { sessionId: string; userId: string; method: StepUpMethod; purpose: StepUpPurpose }): Promise<Date> {
  const expiresAt = new Date(Date.now() + STEP_UP_WINDOW_MS);
  await db.delete(stepUpVerification).where(lt(stepUpVerification.expiresAt, new Date()));
  await db.insert(stepUpVerification).values({ ...input, expiresAt });
  return expiresAt;
}

/** What the UI must ask for, and whether it can skip asking right now. */
export async function stepUpChallenge(userId: string, sessionId: string, purpose: StepUpPurpose): Promise<StepUpChallenge> {
  const [method, fresh] = await Promise.all([stepUpMethodFor(userId), hasFreshStepUp(sessionId, purpose)]);
  return { method, fresh, windowMinutes: Math.round(STEP_UP_WINDOW_MS / 60_000) };
}
