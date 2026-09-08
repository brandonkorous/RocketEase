/*
 * The two places billing is allowed to say no: adding a workspace, and
 * scheduling something new. Reading, editing, replying and already-scheduled
 * publishing are never gated — a lapsed subscription must not lose anyone's work.
 */
import { isSelfHosted } from "@/lib/deployment";
import { entitlements } from "./entitlements";
import { billingConfigured } from "./stripe";

export const SCHEDULING_BLOCKED =
  "New scheduling is paused because a payment didn't go through. Everything already scheduled still publishes. Fix the payment method in Settings → Billing to schedule again.";
export const SCHEDULING_NEEDS_PLAN =
  "New scheduling needs an active subscription. Everything already scheduled still publishes. Start one in Settings → Billing.";

export const SCHEDULING_LICENCE_EXPIRED =
  "New scheduling is paused because this install's licence has expired. Everything already scheduled still publishes. Set a new licence key in the install's Secret to schedule again.";
export const SCHEDULING_EVALUATION_ENDED =
  "New scheduling needs a licence key: the evaluation period has ended. Everything already scheduled still publishes.";

/** Why new scheduling is blocked for this organization, or null. */
export async function schedulingBlock(organizationId: string): Promise<string | null> {
  if (isSelfHosted()) {
    const ent = await entitlements(organizationId);
    if (ent.active) return null;
    return ent.state === "licence_expired" ? SCHEDULING_LICENCE_EXPIRED : SCHEDULING_EVALUATION_ENDED;
  }
  if (!billingConfigured()) return null;
  const ent = await entitlements(organizationId);
  if (ent.active) return null;
  return ent.state === "past_due" || ent.state === "unpaid" ? SCHEDULING_BLOCKED : SCHEDULING_NEEDS_PLAN;
}
