/*
 * Checkout, the customer portal, and keeping our mirror of a Stripe
 * subscription honest. Stripe is authoritative: every write here is followed
 * by a sync of whatever Stripe actually returned.
 */
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { billingSubscription, type SubscriptionStatus } from "@/db/schema/billing";
import { log } from "@/lib/log";
import { activeWorkspaceCount, ensureCustomer } from "./customer";
import { includedAiCredits, overagePriceId, planByKey, planByPriceId, trialDays, type PlanKey } from "./plans";
import { stripe } from "./stripe";

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:5001";
const billingUrl = (workspaceId: string) => `${appUrl()}/app/${workspaceId}/settings/billing`;

const at = (seconds: number | null | undefined) => (seconds ? new Date(seconds * 1000) : null);

/** Our stored subscription for an organization, or null. */
export async function subscriptionForOrg(organizationId: string) {
  const [row] = await db.select().from(billingSubscription).where(eq(billingSubscription.organizationId, organizationId));
  return row ?? null;
}

/**
 * Hosted Checkout for a new subscription. Quantity is the organization's
 * active workspaces; the metered AI-overage price rides along with no quantity
 * of its own (usage decides it).
 */
export async function createCheckoutSession(input: {
  organizationId: string;
  workspaceId: string;
  planKey: PlanKey;
  email: string | null;
}): Promise<string | null> {
  const plan = planByKey(input.planKey);
  if (!plan) return null;
  const customer = await ensureCustomer(input.organizationId, input.email);
  const quantity = Math.max(1, await activeWorkspaceCount(input.organizationId));
  const overage = overagePriceId();
  const days = trialDays();

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [{ price: plan.priceId, quantity }, ...(overage ? [{ price: overage }] : [])],
    success_url: `${billingUrl(input.workspaceId)}?ok=subscribed`,
    cancel_url: `${billingUrl(input.workspaceId)}?error=Checkout%20was%20cancelled.%20Nothing%20was%20charged.`,
    client_reference_id: input.organizationId,
    metadata: { organizationId: input.organizationId, plan: plan.key },
    subscription_data: {
      metadata: { organizationId: input.organizationId, plan: plan.key },
      ...(days > 0 ? { trial_period_days: days } : {}),
    },
  });
  return session.url;
}

/** Stripe's own portal owns payment methods, plan changes and cancellation. */
export async function createPortalSession(organizationId: string, workspaceId: string, email: string | null): Promise<string> {
  const customer = await ensureCustomer(organizationId, email);
  const session = await stripe().billingPortal.sessions.create({ customer, return_url: billingUrl(workspaceId) });
  return session.url;
}

/** The line item carrying the flat per-workspace price (not the metered one). */
export function flatItem(sub: Stripe.Subscription): Stripe.SubscriptionItem | undefined {
  return sub.items.data.find((i) => i.price.id && planByPriceId(i.price.id)) ?? sub.items.data.find((i) => i.price.recurring?.usage_type !== "metered");
}

/**
 * Stripe subscription → our mirror. Period bounds live on the subscription
 * item in current API versions, so they are read from the flat item.
 */
export async function syncSubscription(sub: Stripe.Subscription, organizationId: string) {
  const item = flatItem(sub);
  const plan = item?.price.id ? planByPriceId(item.price.id) : undefined;
  const values = {
    organizationId,
    stripeSubscriptionId: sub.id,
    status: sub.status as SubscriptionStatus,
    plan: plan?.key ?? (typeof sub.metadata?.plan === "string" ? sub.metadata.plan : "workspace_monthly"),
    workspaceQuantity: item?.quantity ?? 1,
    currentPeriodStart: at(item?.current_period_start),
    currentPeriodEnd: at(item?.current_period_end),
    cancelAt: at(sub.cancel_at),
    trialEnd: at(sub.trial_end),
    includedAiCreditsPerWorkspace: includedAiCredits(),
    updatedAt: new Date(),
  };
  await db
    .insert(billingSubscription)
    .values(values)
    .onConflictDoUpdate({ target: billingSubscription.stripeSubscriptionId, set: values });
}

/** Pulls the subscription fresh from Stripe and re-syncs. */
export async function refreshSubscription(stripeSubscriptionId: string, organizationId: string) {
  const sub = await stripe().subscriptions.retrieve(stripeSubscriptionId);
  await syncSubscription(sub, organizationId);
}

/**
 * Called whenever a workspace is created or archived: the billed quantity is
 * the count of active workspaces. A missing subscription or an unconfigured
 * Stripe is a no-op — never a thrown error inside someone else's action.
 */
export async function syncWorkspaceQuantity(organizationId: string): Promise<void> {
  try {
    if (!process.env.STRIPE_SECRET_KEY) return;
    const row = await subscriptionForOrg(organizationId);
    if (!row || ["canceled", "incomplete_expired"].includes(row.status)) return;
    const quantity = Math.max(1, await activeWorkspaceCount(organizationId));
    if (quantity === row.workspaceQuantity) return;

    const sub = await stripe().subscriptions.retrieve(row.stripeSubscriptionId);
    const item = flatItem(sub);
    if (!item) return;
    const updated = await stripe().subscriptions.update(sub.id, {
      items: [{ id: item.id, quantity }],
      proration_behavior: "create_prorations",
    });
    await syncSubscription(updated, organizationId);
  } catch (err) {
    // Billing must never block workspace administration; the nightly sync retries.
    log.error("billing quantity sync failed", { organizationId, err });
  }
}
