import { beforeEach, describe, expect, test } from "vitest";
import type Stripe from "stripe";
import { handleStripeEvent, type WebhookEffects, type WebhookStore } from "./webhook";

/** In-memory stand-ins for Postgres, Stripe and the audit log. */
function harness() {
  const processed = new Set<string>();
  const claimed = new Set<string>();
  const synced: { subscriptionId: string; organizationId: string }[] = [];
  const audited: { action: string; organizationId: string; targetId: string }[] = [];

  const store: WebhookStore = {
    async claim(event) {
      if (processed.has(event.id)) return "duplicate";
      claimed.add(event.id);
      return "claimed";
    },
    async markProcessed(id) {
      processed.add(id);
    },
  };
  const fx: WebhookEffects = {
    async resolveOrg({ organizationId, customerId }) {
      if (customerId === "cus_known") return "org1";
      return organizationId ?? null;
    },
    async syncSubscriptionId(subscriptionId, organizationId) {
      synced.push({ subscriptionId, organizationId });
    },
    async record(action, organizationId, target) {
      audited.push({ action, organizationId, targetId: target.id });
    },
  };
  return { store, fx, synced, audited, processed, claimed };
}

const event = (type: string, object: unknown, id = "evt_1") => ({ id, type, data: { object } }) as unknown as Stripe.Event;

const checkout = event("checkout.session.completed", {
  metadata: { organizationId: "org1" },
  customer: "cus_new",
  subscription: "sub_1",
});

describe("stripe webhook", () => {
  let h: ReturnType<typeof harness>;
  beforeEach(() => {
    h = harness();
  });

  test("checkout syncs the subscription and records it on the organization", async () => {
    expect(await handleStripeEvent(checkout, h.store, h.fx)).toEqual({ status: "applied", action: "billing.checkout_completed" });
    expect(h.synced).toEqual([{ subscriptionId: "sub_1", organizationId: "org1" }]);
    expect(h.audited).toEqual([{ action: "billing.checkout_completed", organizationId: "org1", targetId: "sub_1" }]);
  });

  test("a redelivered event does no work twice", async () => {
    await handleStripeEvent(checkout, h.store, h.fx);
    const again = await handleStripeEvent(checkout, h.store, h.fx);
    expect(again).toEqual({ status: "duplicate" });
    expect(h.synced).toHaveLength(1);
    expect(h.audited).toHaveLength(1);
  });

  test("an event claimed but never finished is applied on redelivery", async () => {
    // markProcessed never ran, so the claim is not yet a completion.
    const partial: WebhookStore = { claim: async () => "claimed", markProcessed: h.store.markProcessed };
    await handleStripeEvent(checkout, partial, h.fx);
    await handleStripeEvent(checkout, partial, h.fx);
    expect(h.synced).toHaveLength(2);
  });

  test("subscription lifecycle events sync and audit with the right action", async () => {
    const cases: [string, string][] = [
      ["customer.subscription.updated", "billing.subscription_updated"],
      ["customer.subscription.deleted", "billing.subscription_canceled"],
    ];
    for (const [type, action] of cases) {
      const h2 = harness();
      const e = event(type, { id: "sub_9", customer: "cus_known", status: "canceled", metadata: {} });
      expect(await handleStripeEvent(e, h2.store, h2.fx)).toEqual({ status: "applied", action });
      expect(h2.synced).toEqual([{ subscriptionId: "sub_9", organizationId: "org1" }]);
    }
  });

  test("invoice events re-read the subscription named by invoice.parent", async () => {
    const e = event("invoice.payment_failed", {
      id: "in_1",
      customer: "cus_known",
      amount_due: 4900,
      currency: "usd",
      parent: { type: "subscription_details", subscription_details: { subscription: "sub_2" } },
    });
    expect(await handleStripeEvent(e, h.store, h.fx)).toEqual({ status: "applied", action: "billing.payment_failed" });
    expect(h.synced).toEqual([{ subscriptionId: "sub_2", organizationId: "org1" }]);
    expect(h.audited[0].targetId).toBe("in_1");
  });

  test("an unknown organization is skipped rather than guessed at", async () => {
    const e = event("customer.subscription.updated", { id: "sub_3", customer: "cus_unknown", metadata: {} });
    expect(await handleStripeEvent(e, h.store, h.fx)).toEqual({ status: "applied", action: undefined });
    expect(h.synced).toHaveLength(0);
    expect(h.audited).toHaveLength(0);
  });

  test("event types we do not handle are ignored without claiming them", async () => {
    const e = event("customer.created", { id: "cus_x" }, "evt_x");
    expect(await handleStripeEvent(e, h.store, h.fx)).toEqual({ status: "ignored" });
    expect(h.claimed.size).toBe(0);
  });
});
