/*
 * What an organization is entitled to right now.
 *
 * Rules (positioning-2026): flat price per workspace, unlimited seats, client
 * reviewers free. Reading existing data is NEVER gated. A failed payment keeps
 * publishing working for a 7-day grace period; after that only *new*
 * scheduling stops, announced with a persistent Alert rather than a toast.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { billingSubscription, type SubscriptionStatus } from "@/db/schema/billing";
import { GRACE_DAYS, includedAiCredits } from "./plans";
import { billingConfigured } from "./stripe";

/** Workspaces an organization may have before it needs a subscription. */
export const FREE_WORKSPACES = 1;

export type EntitlementState = SubscriptionStatus | "none" | "unconfigured";

export type Entitlements = {
  state: EntitlementState;
  /** The product works normally (includes trial and the post-failure grace). */
  active: boolean;
  trialing: boolean;
  /** Payment failed and the grace period is still running. */
  inGrace: boolean;
  gracefulUntil: Date | null;
  /** null means unlimited — each extra workspace simply joins the bill. */
  workspacesAllowed: number | null;
  aiCreditsPerWorkspace: number;
};

type SubRow = Pick<
  typeof billingSubscription.$inferSelect,
  "status" | "workspaceQuantity" | "currentPeriodEnd" | "trialEnd" | "includedAiCreditsPerWorkspace" | "updatedAt"
>;

const days = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

/** Pure core, so the maths is testable without a database or Stripe. */
export function computeEntitlements(sub: SubRow | null, now: Date, opts: { configured: boolean; includedCredits: number }): Entitlements {
  // No Stripe in this deployment: gate nothing, and say so on the billing page.
  if (!opts.configured) {
    return { state: "unconfigured", active: true, trialing: false, inGrace: false, gracefulUntil: null, workspacesAllowed: null, aiCreditsPerWorkspace: opts.includedCredits };
  }
  if (!sub) {
    return { state: "none", active: false, trialing: false, inGrace: false, gracefulUntil: null, workspacesAllowed: FREE_WORKSPACES, aiCreditsPerWorkspace: 0 };
  }
  const credits = sub.includedAiCreditsPerWorkspace || opts.includedCredits;
  if (sub.status === "active" || sub.status === "trialing") {
    return {
      state: sub.status,
      active: true,
      trialing: sub.status === "trialing",
      inGrace: false,
      gracefulUntil: null,
      workspacesAllowed: null,
      aiCreditsPerWorkspace: credits,
    };
  }
  if (sub.status === "past_due" || sub.status === "unpaid") {
    // Grace runs from the renewal that failed; fall back to the last sync.
    const until = days(sub.currentPeriodEnd ?? sub.updatedAt, GRACE_DAYS);
    const inGrace = now < until;
    return {
      state: sub.status,
      active: inGrace,
      trialing: false,
      inGrace,
      gracefulUntil: until,
      // Adding a workspace during grace would raise a bill that is already failing.
      workspacesAllowed: sub.workspaceQuantity,
      aiCreditsPerWorkspace: credits,
    };
  }
  // canceled, incomplete, incomplete_expired, paused: keep everything readable, allow nothing new.
  return {
    state: sub.status,
    active: false,
    trialing: false,
    inGrace: false,
    gracefulUntil: null,
    workspacesAllowed: sub.workspaceQuantity,
    aiCreditsPerWorkspace: credits,
  };
}

/** Entitlements for an organization, from the mirror written by the webhook. */
export async function entitlements(organizationId: string, now = new Date()): Promise<Entitlements> {
  const configured = billingConfigured();
  const [sub] = configured
    ? await db.select().from(billingSubscription).where(eq(billingSubscription.organizationId, organizationId))
    : [];
  return computeEntitlements(sub ?? null, now, { configured, includedCredits: includedAiCredits() });
}

export class BillingRequiredError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "BillingRequiredError";
  }
}

export const NEEDS_SUBSCRIPTION = "Adding another workspace needs an active subscription. Open Settings → Billing to start one.";
export const NEEDS_PAYMENT = "A payment failed, so new workspaces are paused until billing is fixed. Everything you already have stays exactly as it is.";

/**
 * Guard for workspace creation only. It never gates reading, publishing an
 * already-scheduled post, or anything an organization already has.
 */
export async function requireEntitled(organizationId: string, currentWorkspaces: number): Promise<void> {
  const ent = await entitlements(organizationId);
  if (ent.workspacesAllowed === null) return;
  if (currentWorkspaces < ent.workspacesAllowed) return;
  throw new BillingRequiredError(ent.inGrace || ent.state === "past_due" || ent.state === "unpaid" ? NEEDS_PAYMENT : NEEDS_SUBSCRIPTION);
}
