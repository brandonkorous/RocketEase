/*
 * What the platform itself costs an organization, per client workspace.
 *
 * Every amount comes from the live Stripe price object — the repo never states
 * a price (lib/billing/plans.ts). When Stripe is not configured, has no
 * subscription, or cannot be reached, the share is unknown and says which,
 * because a missing cost rendered as 0 would invent margin that isn't there.
 */
import "server-only";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/db";
import { billingSubscription } from "@/db/schema/billing";
import { includedAiCredits, overagePriceId, planByKey } from "@/lib/billing/plans";
import { billingConfigured, stripe } from "@/lib/billing/stripe";
import { money, unknownMoney, type Money } from "./margin";

export const UNCONFIGURED = "Billing isn't configured for this deployment, so the platform's own cost is unknown.";
export const NO_SUBSCRIPTION = "This organization has no subscription yet, so there is no platform cost to share across clients.";
export const NO_PLAN = "This subscription's plan has no configured Stripe price in this deployment, so its cost can't be read.";
export const STRIPE_UNREACHABLE = "Stripe couldn't be reached, so the subscription price is unknown right now.";
export const TIERED_PRICE = "This plan uses a tiered Stripe price, so a flat per-workspace share can't be derived. Read it from the invoice instead.";
export const NO_OVERAGE_PRICE = "AI overage isn't metered in this deployment (no Stripe overage price), so its cost is unknown.";
export const TIERED_OVERAGE = "The AI overage price is tiered in Stripe, so a per-credit cost can't be derived.";

export type PlatformCosts = {
  /** Subscription cost ÷ billed workspaces, normalised to one month. */
  share: Money;
  currency: string;
  workspaceQuantity: number;
  /** AI credits each workspace gets before overage is metered. */
  includedCredits: number;
  /** Cost of one overage credit, in minor units. */
  overageUnitCents: number | null;
  overageReason: string | null;
};

const unknown = (reason: string, includedCredits: number): PlatformCosts => ({
  share: unknownMoney(reason),
  currency: "USD",
  workspaceQuantity: 0,
  includedCredits,
  overageUnitCents: null,
  overageReason: reason,
});

/** Months one billing interval covers, so a yearly plan still divides into a month. */
function monthsPerInterval(recurring: Stripe.Price.Recurring | null): number {
  if (!recurring) return 1;
  const count = recurring.interval_count || 1;
  if (recurring.interval === "year") return 12 * count;
  if (recurring.interval === "week") return count / 4.345;
  if (recurring.interval === "day") return count / 30.44;
  return count;
}

export async function platformCosts(organizationId: string): Promise<PlatformCosts> {
  const included = includedAiCredits();
  if (!billingConfigured()) return unknown(UNCONFIGURED, included);
  const [sub] = await db.select().from(billingSubscription).where(eq(billingSubscription.organizationId, organizationId));
  if (!sub) return unknown(NO_SUBSCRIPTION, included);
  const plan = planByKey(sub.plan);
  if (!plan) return unknown(NO_PLAN, sub.includedAiCreditsPerWorkspace || included);

  const overageId = overagePriceId();
  try {
    const [price, overage] = await Promise.all([
      stripe().prices.retrieve(plan.priceId),
      overageId ? stripe().prices.retrieve(overageId) : Promise.resolve(null),
    ]);
    return fromPrices(sub, price, overage, overageId ? null : NO_OVERAGE_PRICE, included);
  } catch {
    return unknown(STRIPE_UNREACHABLE, sub.includedAiCreditsPerWorkspace || included);
  }
}

function fromPrices(
  sub: typeof billingSubscription.$inferSelect,
  price: Stripe.Price,
  overage: Stripe.Price | null,
  missingOverage: string | null,
  fallbackCredits: number,
): PlatformCosts {
  const quantity = Math.max(1, sub.workspaceQuantity);
  const months = monthsPerInterval(price.recurring);
  // Stripe minor units, the same 1/100 convention the rate form uses. The flat
  // plan is priced per workspace, so the bill is unit x quantity and the share
  // is that divided back by the billed workspaces, normalised to one month.
  const total = price.unit_amount == null ? null : price.unit_amount * quantity;
  const share = total == null ? unknownMoney(TIERED_PRICE) : money(total / quantity / months);
  const overageUnit = overage?.unit_amount ?? null;
  return {
    share,
    currency: (price.currency || "usd").toUpperCase(),
    workspaceQuantity: quantity,
    includedCredits: sub.includedAiCreditsPerWorkspace || fallbackCredits,
    overageUnitCents: overageUnit,
    overageReason: missingOverage ?? (overage && overageUnit == null ? TIERED_OVERAGE : null),
  };
}

/** Whole credits above the allowance, priced. Zero overage costs zero even with no price configured. */
export function aiCost(creditsUsed: number | null, costs: PlatformCosts, creditsReason: string | null): Money {
  if (creditsUsed === null) return unknownMoney(creditsReason ?? "AI usage for this period is unknown.");
  const overage = Math.max(0, Math.floor(creditsUsed) - Math.max(0, costs.includedCredits));
  if (overage === 0) return money(0);
  if (costs.overageUnitCents == null) return unknownMoney(costs.overageReason ?? NO_OVERAGE_PRICE);
  return money(overage * costs.overageUnitCents);
}
