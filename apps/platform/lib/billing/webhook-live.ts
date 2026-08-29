/*
 * The real store and effects behind lib/billing/webhook.ts: Postgres for
 * idempotency, Stripe for the authoritative object, the audit log for the
 * organization-level record permissions.md requires.
 */
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { billingEvent } from "@/db/schema/billing";
import { audit } from "@/lib/audit";
import { linkCustomer, orgForCustomer } from "./customer";
import { refreshSubscription } from "./subscription";
import type { WebhookEffects, WebhookStore } from "./webhook";

export const store: WebhookStore = {
  async claim(event: Stripe.Event) {
    const [inserted] = await db
      .insert(billingEvent)
      .values({ stripeEventId: event.id, type: event.type, payload: event as unknown as Record<string, unknown> })
      .onConflictDoNothing()
      .returning({ id: billingEvent.id });
    if (inserted) return "claimed";
    // A row that never reached processedAt crashed mid-apply; applying again is safe.
    const [existing] = await db.select({ processedAt: billingEvent.processedAt }).from(billingEvent).where(eq(billingEvent.stripeEventId, event.id));
    return existing?.processedAt ? "duplicate" : "claimed";
  },
  async markProcessed(stripeEventId: string) {
    await db.update(billingEvent).set({ processedAt: new Date() }).where(eq(billingEvent.stripeEventId, stripeEventId));
  },
};

export const effects: WebhookEffects = {
  async resolveOrg({ organizationId, customerId }) {
    if (customerId) {
      const known = await orgForCustomer(customerId);
      if (known) return known;
      // First event for a customer created outside our checkout: mirror the link.
      if (organizationId) {
        await linkCustomer(organizationId, customerId, null);
        return organizationId;
      }
      return null;
    }
    return organizationId ?? null;
  },
  async syncSubscriptionId(subscriptionId, organizationId) {
    await refreshSubscription(subscriptionId, organizationId);
  },
  async record(action, organizationId, target, summary) {
    await audit({ action, organizationId, targetType: target.type, targetId: target.id, summary: summary ? { after: summary } : undefined });
  },
};
