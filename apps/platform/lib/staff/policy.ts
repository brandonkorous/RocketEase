/*
 * Who counts as staff — pure, so the rules are testable without a database,
 * an environment, or a session.
 *
 * Precedence: a stored row wins; otherwise the STAFF_EMAILS bootstrap, which
 * exists only so the first operator can reach /staff on a fresh deployment.
 */
import type { StaffRole } from "@/db/schema/staff";

export type { StaffRole };

/** `admin` implies everything `support` can do. */
const RANK: Record<StaffRole, number> = { support: 1, admin: 2 };

export const staffAtLeast = (held: StaffRole, needed: StaffRole) => RANK[held] >= RANK[needed];

/**
 * STAFF_EMAILS=brandon@wize.works,ops@wize.works — bootstrap operators, granted
 * `admin`. Comma-separated, case-insensitive, compared whole (never a substring:
 * "wize.works" must not match "notwize.works").
 */
export function parseStaffEmails(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.includes("@")),
  );
}

export type StaffCandidate = { email: string; emailVerified: boolean };

/**
 * The stored row wins, so a bootstrap address can be demoted or removed without
 * a redeploy. The env path additionally requires a VERIFIED email: on a fresh
 * deployment the listed address may not have an account yet, and an unverified
 * signup on that address must not inherit operator access.
 */
export function resolveStaffRole(row: { role: StaffRole } | null, envEmails: Set<string>, candidate: StaffCandidate): StaffRole | null {
  if (row) return row.role;
  if (!candidate.emailVerified) return null;
  return envEmails.has(candidate.email.trim().toLowerCase()) ? "admin" : null;
}
