import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { audit } from "@/lib/audit";
import { getSession } from "@/lib/session";
import { recordStepUp } from "@/lib/step-up";
import { decodeTicket, nonceMatches, STEP_UP_COOKIE } from "@/lib/sso/step-up-ticket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:5001";

/**
 * Landing point after an SSO step-up round trip. The identity provider has
 * already re-authenticated the user and Better Auth has issued a fresh session
 * cookie; all this does is bind the proof to that session for the 5-minute
 * window. The nonce in the cookie must match the one in the URL.
 */
export async function GET(req: Request) {
  const jar = await cookies();
  const ticket = decodeTicket(jar.get(STEP_UP_COOKIE)?.value);
  jar.delete(STEP_UP_COOKIE);
  const state = new URL(req.url).searchParams.get("state");
  const session = await getSession();

  if (!session) return NextResponse.redirect(new URL("/login", appUrl()));
  if (!ticket || !nonceMatches(ticket.nonce, state)) {
    await audit({
      action: "security.step_up",
      actorUserId: session.user.id,
      workspaceId: ticket?.workspaceId ?? null,
      targetType: "session",
      targetId: session.session.id,
      result: "denied",
      summary: { note: "sso: state mismatch" },
    });
    return NextResponse.redirect(new URL(ticket?.returnTo ?? "/", appUrl()));
  }

  const expiresAt = await recordStepUp({
    sessionId: session.session.id,
    userId: session.user.id,
    method: "sso",
    purpose: ticket.purpose,
  });
  await audit({
    action: "security.step_up",
    actorUserId: session.user.id,
    workspaceId: ticket.workspaceId,
    targetType: "session",
    targetId: session.session.id,
    summary: { after: { purpose: ticket.purpose, method: "sso", forced: ticket.forced, expiresAt: expiresAt.toISOString() } },
  });
  return NextResponse.redirect(new URL(ticket.returnTo, appUrl()));
}
