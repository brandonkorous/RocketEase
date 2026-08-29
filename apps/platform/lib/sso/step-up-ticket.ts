import { STEP_UP_PURPOSES, type StepUpPurpose } from "@/lib/step-up";

/** Short-lived, httpOnly cookie that ties an IdP round trip to one step-up request. */
export const STEP_UP_COOKIE = "rke_sso_stepup";
export const STEP_UP_TICKET_SECONDS = 600;

/** `forced` records whether the IdP was actually asked to re-prompt (OIDC only). */
export type StepUpTicket = { nonce: string; purpose: StepUpPurpose; workspaceId: string; returnTo: string; forced: boolean };

export const encodeTicket = (t: StepUpTicket) => JSON.stringify(t);

export function decodeTicket(raw: string | undefined): StepUpTicket | null {
  if (!raw) return null;
  try {
    const t = JSON.parse(raw) as Partial<StepUpTicket>;
    if (!t.nonce || !t.workspaceId || !t.purpose) return null;
    if (!(STEP_UP_PURPOSES as readonly string[]).includes(t.purpose)) return null;
    return { nonce: t.nonce, purpose: t.purpose, workspaceId: t.workspaceId, returnTo: safeReturnTo(t.returnTo), forced: t.forced === true };
  } catch {
    return null;
  }
}

/** Only same-origin app paths may be returned to — never an absolute URL. */
export function safeReturnTo(value: string | undefined | null): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value.slice(0, 500);
}

/** Constant-time-ish comparison for the round-trip nonce. */
export function nonceMatches(a: string, b: string | null): boolean {
  if (!b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
