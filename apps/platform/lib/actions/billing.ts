"use server";

/*
 * Billing actions. Only an organization owner or admin can start a
 * subscription or open the portal (permissions.md: billing is the org's).
 * Money never moves here — Stripe's hosted pages own that.
 */
import { requireOrgAdmin } from "@/lib/actions/agency/shared";
import { fail, guard, type ActionState } from "@/lib/actions/content/shared";
import { audit } from "@/lib/audit";
import { requireWorkspace } from "@/lib/session";
import { planByKey, type PlanKey } from "@/lib/billing/plans";
import { createCheckoutSession, createPortalSession } from "@/lib/billing/subscription";
import { BILLING_UNAVAILABLE, BILLING_UNCONFIGURED, billingConfigured } from "@/lib/billing/stripe";

type Redirect = ActionState & { url?: string };

/** Workspace context plus the org gate, in the order the settings page needs. */
async function billingActor(workspaceId: string) {
  const ctx = await requireWorkspace(workspaceId);
  const org = await requireOrgAdmin(ctx.workspace.organizationId);
  return { ctx, org };
}

/** Hosted Checkout for the chosen plan; the browser follows the returned URL. */
export async function startSubscription(input: { workspaceId: string; planKey: string }): Promise<Redirect> {
  return guard(async () => {
    if (!billingConfigured()) return fail(BILLING_UNCONFIGURED);
    const plan = planByKey(input.planKey);
    if (!plan) return fail("That plan isn't available.");
    const { ctx, org } = await billingActor(input.workspaceId);
    try {
      const url = await createCheckoutSession({
        organizationId: org.organizationId,
        workspaceId: input.workspaceId,
        planKey: plan.key as PlanKey,
        email: ctx.session.user.email,
      });
      if (!url) return fail("Stripe didn't return a checkout link. Nothing was charged.");
      await audit({ action: "billing.checkout_started", actorUserId: org.userId, organizationId: org.organizationId, targetType: "organization", targetId: org.organizationId, summary: { after: { plan: plan.key } } });
      return { url };
    } catch {
      return fail(BILLING_UNAVAILABLE);
    }
  });
}

/** Stripe's customer portal: payment methods, plan changes, cancellation, receipts. */
export async function openBillingPortal(input: { workspaceId: string }): Promise<Redirect> {
  return guard(async () => {
    if (!billingConfigured()) return fail(BILLING_UNCONFIGURED);
    const { ctx, org } = await billingActor(input.workspaceId);
    try {
      const url = await createPortalSession(org.organizationId, input.workspaceId, ctx.session.user.email);
      await audit({ action: "billing.portal_opened", actorUserId: org.userId, organizationId: org.organizationId, targetType: "organization", targetId: org.organizationId });
      return { url };
    } catch {
      return fail(BILLING_UNAVAILABLE);
    }
  });
}
