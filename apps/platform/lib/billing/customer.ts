/*
 * The Stripe customer behind an organization. One customer per organization —
 * the billing boundary in data-model.md — created lazily on first checkout.
 */
import { and, count, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { workspace } from "@/db/schema/app";
import { organization } from "@/db/schema/auth";
import { billingCustomer } from "@/db/schema/billing";
import { stripe } from "./stripe";

/** Existing mirror row, or null when the organization has never checked out. */
export async function customerForOrg(organizationId: string) {
  const [row] = await db.select().from(billingCustomer).where(eq(billingCustomer.organizationId, organizationId));
  return row ?? null;
}

/** Billed workspaces: every workspace in the organization that is not archived. */
export async function activeWorkspaceCount(organizationId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(workspace)
    .where(and(eq(workspace.organizationId, organizationId), isNull(workspace.archivedAt)));
  return Number(row?.n ?? 0);
}

/** Creates the Stripe customer on first use and mirrors it locally. */
export async function ensureCustomer(organizationId: string, email: string | null): Promise<string> {
  const existing = await customerForOrg(organizationId);
  if (existing) return existing.stripeCustomerId;

  const [org] = await db.select({ name: organization.name }).from(organization).where(eq(organization.id, organizationId));
  const customer = await stripe().customers.create({
    name: org?.name ?? undefined,
    email: email ?? undefined,
    metadata: { organizationId },
  });
  const [row] = await db
    .insert(billingCustomer)
    .values({ organizationId, stripeCustomerId: customer.id, email })
    .onConflictDoUpdate({ target: billingCustomer.organizationId, set: { updatedAt: new Date() } })
    .returning({ stripeCustomerId: billingCustomer.stripeCustomerId });
  return row.stripeCustomerId;
}

/** Mirrors a customer id seen on a webhook whose organization we know from metadata. */
export async function linkCustomer(organizationId: string, stripeCustomerId: string, email: string | null) {
  await db
    .insert(billingCustomer)
    .values({ organizationId, stripeCustomerId, email })
    .onConflictDoUpdate({ target: billingCustomer.organizationId, set: { stripeCustomerId, email, updatedAt: new Date() } });
}

/** Which organization a Stripe customer belongs to; null when we have never seen it. */
export async function orgForCustomer(stripeCustomerId: string): Promise<string | null> {
  const [row] = await db
    .select({ organizationId: billingCustomer.organizationId })
    .from(billingCustomer)
    .where(eq(billingCustomer.stripeCustomerId, stripeCustomerId));
  return row?.organizationId ?? null;
}
