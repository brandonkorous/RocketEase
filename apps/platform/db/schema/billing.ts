/*
 * Billing (Stripe). Pricing model, from docs/research/positioning-2026.html:
 * a flat price per WORKSPACE per month, unlimited seats, client reviewers and
 * approvers free. AI beyond a monthly allowance per workspace is metered in
 * credits (1 credit = 1,000 output tokens; input counts at 1/5).
 *
 * Prices, meters and the trial length are Stripe objects named by env
 * (lib/billing/plans.ts) — no money amount is ever hardcoded here.
 * Stripe is the source of truth; these tables are a queryable mirror so the
 * app can answer "is this org entitled?" without a network call.
 */
import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organization } from "./auth";
import { workspace } from "./app";

const id = (name = "id") => text(name).primaryKey().default(sql`gen_random_uuid()`);
const now = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow();
const at = (name: string) => timestamp(name, { withTimezone: true });

/** One Stripe customer per organization — the billing boundary (data-model.md). */
export const billingCustomer = pgTable(
  "billing_customer",
  {
    id: id(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    stripeCustomerId: text("stripe_customer_id").notNull(),
    /** Billing contact as Stripe holds it; display only, never used to authenticate. */
    email: text("email"),
    createdAt: now("created_at"),
    updatedAt: now("updated_at"),
  },
  (t) => [
    uniqueIndex("billing_customer_org_idx").on(t.organizationId),
    uniqueIndex("billing_customer_stripe_idx").on(t.stripeCustomerId),
  ],
);

/** Stripe subscription statuses, mirrored verbatim so we never invent a state. */
export const SUBSCRIPTION_STATUSES = [
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const billingSubscription = pgTable(
  "billing_subscription",
  {
    id: id(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    stripeSubscriptionId: text("stripe_subscription_id").notNull(),
    /** Stripe's status string; not an enum so a new Stripe state can never be lost. */
    status: text("status").$type<SubscriptionStatus>().notNull(),
    /** Plan key from lib/billing/plans.ts ("workspace_monthly" | "workspace_yearly"). */
    plan: text("plan").notNull(),
    /** Billed workspaces = active (non-archived) workspaces in the organization. */
    workspaceQuantity: integer("workspace_quantity").notNull().default(1),
    currentPeriodStart: at("current_period_start"),
    currentPeriodEnd: at("current_period_end"),
    /** Set while a cancellation is pending; access continues until then. */
    cancelAt: at("cancel_at"),
    trialEnd: at("trial_end"),
    /** Allowance snapshot at sync time, so a price change never re-prices the past. */
    includedAiCreditsPerWorkspace: integer("included_ai_credits_per_workspace").notNull().default(0),
    createdAt: now("created_at"),
    updatedAt: now("updated_at"),
  },
  (t) => [
    uniqueIndex("billing_subscription_stripe_idx").on(t.stripeSubscriptionId),
    index("billing_subscription_org_idx").on(t.organizationId),
    index("billing_subscription_status_idx").on(t.status),
  ],
);

/**
 * Every Stripe event we have already applied. The webhook claims a row before
 * doing any work, so a redelivery is a no-op rather than a double-charge.
 */
export const billingEvent = pgTable(
  "billing_event",
  {
    id: id(),
    stripeEventId: text("stripe_event_id").notNull(),
    type: text("type").notNull(),
    processedAt: at("processed_at"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: now("created_at"),
  },
  (t) => [uniqueIndex("billing_event_stripe_idx").on(t.stripeEventId), index("billing_event_type_idx").on(t.type)],
);

/**
 * One row per (subscription, workspace, period): AI credits above the included
 * allowance, reported to the Stripe billing meter exactly once.
 */
export const billingUsageReport = pgTable(
  "billing_usage_report",
  {
    id: id(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    subscriptionId: text("subscription_id")
      .notNull()
      .references(() => billingSubscription.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    /** Overage credits already reported for this period; a later run reports only the delta. */
    credits: integer("credits").notNull().default(0),
    /** Identifier sent to Stripe (also the meter event's idempotency key). */
    stripeMeterEventId: text("stripe_meter_event_id"),
    reportedAt: at("reported_at"),
    createdAt: now("created_at"),
    updatedAt: now("updated_at"),
  },
  (t) => [
    uniqueIndex("billing_usage_report_period_idx").on(t.subscriptionId, t.workspaceId, t.periodStart),
    index("billing_usage_report_org_idx").on(t.organizationId),
  ],
);
