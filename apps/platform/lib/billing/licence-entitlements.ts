/*
 * Entitlements for a self-hosted install, from the licence instead of Stripe.
 * Pure, like computeEntitlements; the same Entitlements shape so every gate
 * (workspaces, scheduling, the billing page) reads one thing.
 *
 * Evaluation (no key): ONE workspace, and scheduling for the trial period
 * (BILLING_TRIAL_DAYS, the same number a cloud trial uses) counted from the
 * day the install was claimed. An install nobody has claimed yet has nothing
 * to gate.
 */
import type { Licence } from "@/lib/licence";
import type { Entitlements } from "./entitlements";

export const EVALUATION_WORKSPACES = 1;

const days = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

export function computeLicenceEntitlements(lic: Licence, opts: { claimedAt: Date | null; now: Date; includedCredits: number; evaluationDays: number }): Entitlements {
  const base = { trialing: false, inGrace: false, gracefulUntil: null as Date | null, aiCreditsPerWorkspace: opts.includedCredits };
  switch (lic.state) {
    case "licensed":
      return { ...base, state: "licensed", active: true, workspacesAllowed: lic.payload?.workspaces ?? null };
    case "licence_grace":
      return { ...base, state: "licence_grace", active: true, inGrace: true, gracefulUntil: lic.graceUntil, workspacesAllowed: lic.payload?.workspaces ?? null };
    case "licence_expired":
      // Nothing new: no more workspaces, no new scheduling. Nothing existing is touched.
      return { ...base, state: "licence_expired", active: false, workspacesAllowed: 0 };
    case "unlicensed": {
      const until = opts.claimedAt ? days(opts.claimedAt, opts.evaluationDays) : null;
      const active = until ? opts.now < until : true;
      return { ...base, state: "unlicensed", active, trialing: active, gracefulUntil: until, workspacesAllowed: EVALUATION_WORKSPACES };
    }
  }
}
