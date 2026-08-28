/*
 * Share tokens for client report links (/r/:token).
 *
 * The token is opaque and carries no tenant identifiers. It is HMAC-signed
 * with BETTER_AUTH_SECRET (same pattern as lib/connections.ts codeVerifierFor)
 * so a forged or truncated token is rejected before any database read, and
 * only its sha256 is stored — a database dump cannot mint a working link.
 *
 * Worker-safe: node crypto only, no next/headers, no server-only.
 */
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SEP = ".";
const SIG_LENGTH = 27; // 20 bytes base64url

function secret(): string {
  const s = process.env.BETTER_AUTH_SECRET;
  if (!s) throw new Error("BETTER_AUTH_SECRET is not set");
  return s;
}

const sign = (value: string) => createHmac("sha256", secret()).update(`report-share:${value}`).digest("base64url").slice(0, SIG_LENGTH);

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Mint a token. Store `hash`; show `token` once. */
export function mintShareToken(): { token: string; hash: string } {
  const body = randomBytes(24).toString("base64url");
  const token = `${body}${SEP}${sign(body)}`;
  return { token, hash: hashToken(token) };
}

const safeEqual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Structural + signature check. Cheap, runs before the database is touched. */
export function isWellFormedToken(token: string): boolean {
  if (!token || token.length > 128 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return false;
  const [body, sig] = token.split(SEP);
  if (!body || !sig || sig.length !== SIG_LENGTH) return false;
  try {
    return safeEqual(sig, sign(body));
  } catch {
    return false;
  }
}

import { DEFAULT_SHARE_DAYS, MAX_SHARE_DAYS } from "./share-config";
export { DEFAULT_SHARE_DAYS, MAX_SHARE_DAYS };

export function shareExpiry(days: number, from = new Date()): Date {
  const d = Math.min(MAX_SHARE_DAYS, Math.max(1, Math.round(days)));
  return new Date(from.getTime() + d * 86_400_000);
}

export type ShareState = "ok" | "revoked" | "expired";

export function shareState(share: { expiresAt: Date; revokedAt: Date | null }, now = new Date()): ShareState {
  if (share.revokedAt) return "revoked";
  if (share.expiresAt.getTime() <= now.getTime()) return "expired";
  return "ok";
}

/** Passcode at rest: scrypt with a per-row salt. Never stores the passcode. */
export function hashPasscode(passcode: string): string {
  const salt = randomBytes(16).toString("base64url");
  return `s1$${salt}$${scryptSync(passcode, salt, 32).toString("base64url")}`;
}

export function verifyPasscode(passcode: string, stored: string | null): boolean {
  if (!stored) return true;
  const [v, salt, digest] = stored.split("$");
  if (v !== "s1" || !salt || !digest) return false;
  try {
    return safeEqual(scryptSync(passcode, salt, 32).toString("base64url"), digest);
  } catch {
    return false;
  }
}

/** Cookie value proving this browser already answered the passcode for one share. */
export const passcodeProof = (shareId: string, passcodeHash: string) =>
  createHmac("sha256", secret()).update(`report-share-pass:${shareId}:${passcodeHash}`).digest("base64url");

export const passcodeCookieName = (shareId: string) => `mis_r_${shareId.slice(0, 12)}`;

/** Audit-safe visitor fingerprint: no full IP, no full user agent (privacy by default). */
export function truncateVisitor(ip: string | null, userAgent: string | null) {
  const parts = (ip ?? "").split(".");
  const trimmedIp = parts.length === 4 ? `${parts[0]}.${parts[1]}.x.x` : ip ? `${ip.split(":").slice(0, 2).join(":")}::` : null;
  return { ip: trimmedIp, userAgent: userAgent ? userAgent.slice(0, 80) : null };
}
