"use server";

import { cookies, headers } from "next/headers";
import { resolveShare } from "@/lib/reports/access";
import { rateLimit } from "@/lib/reports/rate-limit";
import { passcodeCookieName, passcodeProof, verifyPasscode } from "@/lib/reports/share";

export type UnlockState = { error?: string; ok?: boolean };

/**
 * Passcode gate for a share link. Rate-limited per token so the passcode
 * cannot be brute-forced, and the proof cookie is bound to the stored hash so
 * it dies the moment the share is re-issued.
 */
export async function unlockShare(token: string, passcode: string): Promise<UnlockState> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`unlock:${token}:${ip}`, 8, 60_000).ok) return { error: "Too many attempts. Wait a minute and try again." };
  const share = await resolveShare(token);
  if (share.status !== "ok") return { error: "This link is no longer available." };
  if (!share.passcodeHash) return { ok: true };
  if (!verifyPasscode(passcode.trim(), share.passcodeHash)) return { error: "That passcode is not right." };
  const jar = await cookies();
  jar.set(passcodeCookieName(share.shareId), passcodeProof(share.shareId, share.passcodeHash), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: `/r/${token}`,
    maxAge: 12 * 3600,
  });
  return { ok: true };
}
