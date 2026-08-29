/*
 * Stripe webhook application, kept out of the route so it can be tested with a
 * fake store and fake Stripe.
 *
 * Idempotency is a claim-then-apply: the event id is inserted first, and only
 * an event that has never completed is applied. A redelivery of a finished
 * event is a no-op; a redelivery of one that crashed mid-apply runs again,
 * which is safe because every apply is an upsert.
 */
import type Stripe from "stripe";

export type EventClaim = "claimed" | "duplicate";

export type WebhookStore = {
  /** "duplicate" once the event has been applied to completion. */
  claim(event: Stripe.Event): Promise<EventClaim>;
  markProcessed(stripeEventId: string): Promise<void>;
};

export type WebhookEffects = {
  /** Organization behind an event, from metadata or the customer mirror. */
  resolveOrg(input: { organizationId?: string | null; customerId?: string | null }): Promise<string | null>;
  syncSubscriptionId(subscriptionId: string, organizationId: string): Promise<void>;
  record(action: string, organizationId: string, target: { type: string; id: string }, summary?: Record<string, unknown>): Promise<void>;
};

export const HANDLED_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
] as const;

export type HandledEvent = (typeof HANDLED_EVENTS)[number];

export const isHandled = (type: string): type is HandledEvent => (HANDLED_EVENTS as readonly string[]).includes(type);

const idOf = (v: string | { id: string } | null | undefined): string | null => (typeof v === "string" ? v : (v?.id ?? null));

/** Subscription id an invoice belongs to (invoice.parent in current API versions). */
function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const details = invoice.parent?.subscription_details;
  return details ? idOf(details.subscription) : null;
}

export type HandleResult = { status: "applied" | "duplicate" | "ignored"; action?: string };

/** Applies one verified Stripe event exactly once. */
export async function handleStripeEvent(event: Stripe.Event, store: WebhookStore, fx: WebhookEffects): Promise<HandleResult> {
  if (!isHandled(event.type)) return { status: "ignored" };
  if ((await store.claim(event)) === "duplicate") return { status: "duplicate" };
  const action = await apply(event, fx);
  await store.markProcessed(event.id);
  return { status: "applied", action };
}

async function apply(event: Stripe.Event, fx: WebhookEffects): Promise<string | undefined> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const organizationId = await fx.resolveOrg({
        organizationId: session.metadata?.organizationId ?? session.client_reference_id,
        customerId: idOf(session.customer),
      });
      const subscriptionId = idOf(session.subscription);
      if (!organizationId || !subscriptionId) return;
      await fx.syncSubscriptionId(subscriptionId, organizationId);
      await fx.record("billing.checkout_completed", organizationId, { type: "subscription", id: subscriptionId });
      return "billing.checkout_completed";
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const organizationId = await fx.resolveOrg({ organizationId: sub.metadata?.organizationId, customerId: idOf(sub.customer) });
      if (!organizationId) return;
      await fx.syncSubscriptionId(sub.id, organizationId);
      const action = event.type === "customer.subscription.deleted" ? "billing.subscription_canceled" : "billing.subscription_updated";
      await fx.record(action, organizationId, { type: "subscription", id: sub.id }, { status: sub.status });
      return action;
    }
    case "invoice.paid":
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const organizationId = await fx.resolveOrg({ customerId: idOf(invoice.customer) });
      if (!organizationId) return;
      const subscriptionId = invoiceSubscriptionId(invoice);
      // The invoice moves the subscription's status, so re-read it from Stripe.
      if (subscriptionId) await fx.syncSubscriptionId(subscriptionId, organizationId);
      const action = event.type === "invoice.paid" ? "billing.invoice_paid" : "billing.payment_failed";
      await fx.record(action, organizationId, { type: "invoice", id: invoice.id ?? event.id }, { amountDue: invoice.amount_due, currency: invoice.currency });
      return action;
    }
  }
}
