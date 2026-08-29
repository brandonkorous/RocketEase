/*
 * The two places billing is allowed to say no: adding a workspace, and
 * scheduling something new. Reading, editing, replying and already-scheduled
 * publishing are never gated — a lapsed subscription must not lose anyone's work.
 */
import { entitlements } from "./entitlements";
import { billingConfigured } from "./stripe";

export const SCHEDULING_BLOCKED =
  "New scheduling is paused because a payment didn't go through. Everything already scheduled still publishes. Fix the payment method in Settings → Billing to schedule again.";
export const SCHEDULING_NEEDS_PLAN =
  "New scheduling needs an active subscription. Everything already scheduled still publishes. Start one in Settings → Billing.";

/** Why new scheduling is blocked for this organization, or null. */
export async function schedulingBlock(organizationId: string): Promise<string | null> {
  if (!billingConfigured()) return null;
  const ent = await entitlements(organizationId);
  if (ent.active) return null;
  return ent.state === "past_due" || ent.state === "unpaid" ? SCHEDULING_BLOCKED : SCHEDULING_NEEDS_PLAN;
}
