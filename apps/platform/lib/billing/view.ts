/*
 * Labels for the billing section. Every money string comes from a Stripe price
 * or invoice object; nothing here states an amount of its own.
 */
import type { SubscriptionStatus } from "@/db/schema/billing";
import type { EntitlementState } from "./entitlements";

export const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  incomplete: "Awaiting first payment",
  incomplete_expired: "Checkout expired",
  trialing: "Free trial",
  active: "Active",
  past_due: "Payment failed",
  canceled: "Canceled",
  unpaid: "Unpaid",
  paused: "Paused",
};

export const statusLabel = (status: string) => STATUS_LABEL[status as SubscriptionStatus] ?? status;

/** The plain-language line under the plan card, never a colour on its own. */
export function stateSummary(state: EntitlementState, opts: { gracefulUntil?: string | null } = {}): string {
  switch (state) {
    case "unconfigured":
      return "Billing isn't configured for this deployment, so nothing here is charged.";
    case "none":
      return "No subscription yet. Start one to add more workspaces and keep scheduling.";
    case "trialing":
      return "You're on the free trial. Nothing is charged until it ends.";
    case "active":
      return "Everything is active.";
    case "past_due":
    case "unpaid":
      return opts.gracefulUntil
        ? `A payment didn't go through. Publishing continues until ${opts.gracefulUntil}; after that new scheduling pauses until it's fixed.`
        : "A payment didn't go through. Fix the payment method to keep scheduling.";
    case "canceled":
      return "This subscription is canceled. Everything you have stays readable and exportable.";
    case "paused":
      return "This subscription is paused.";
    default:
      return "Checkout hasn't finished yet.";
  }
}

/** Seats line — the promise the pricing model makes, stated plainly. */
export const SEATS_LINE = "Unlimited team members. Client reviewers are always free.";

/** Invoice status as a person reads it. */
export const INVOICE_STATUS: Record<string, string> = {
  paid: "Paid",
  open: "Due",
  draft: "Draft",
  uncollectible: "Uncollectible",
  void: "Void",
};
