/*
 * Agency economics (M8.11). `client_rate` is what the agency charges a client
 * — entered by the agency, never inferred. Nothing here is a Stripe object:
 * these are the agency's own commercial terms with its client, and the
 * platform's own cost comes from Stripe (lib/billing) instead.
 *
 * Amounts are minor units (cents) in the stated currency; markups are basis
 * points so "45%" is 4500 with no floating point in the database.
 */
import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { workspace } from "./app";
// Relative, not aliased: drizzle-kit reads this file outside the Next.js path map.
import type { ClientBillingModel } from "../../lib/agency/margin";
import type { StatementLine, StatementStatus } from "../../lib/agency/statement";

export const clientRate = pgTable(
  "client_rate",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    /** How this client is billed. "none" means the agency has not said yet. */
    billingModel: text("billing_model").$type<ClientBillingModel>().notNull().default("none"),
    /** ISO 4217, the currency of every amount on this row. */
    currency: text("currency").notNull().default("USD"),
    retainerCents: integer("retainer_cents").notNull().default(0),
    /** Null rather than 0: an unset per-post rate is unknown, not free. */
    perPostCents: integer("per_post_cents"),
    hourlyCents: integer("hourly_cents"),
    /** Basis points added when the agency rebills media it buys; null = the client pays media direct. */
    adSpendMarkupBps: integer("ad_spend_markup_bps"),
    /** Basis points added when AI usage is rebilled; null = the agency absorbs it. */
    aiCreditMarkupBps: integer("ai_credit_markup_bps"),
    note: text("note").notNull().default(""),
    /** Who the statement goes to at the client (M14.10); Stripe emails the invoice there. */
    billingName: text("billing_name"),
    billingEmail: text("billing_email"),
    /** The customer Stripe made for this client ON THE AGENCY'S OWN account; null until the first statement. */
    stripeCustomerId: text("stripe_customer_id"),
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("client_rate_workspace_idx").on(t.workspaceId),
    index("client_rate_org_idx").on(t.organizationId),
  ],
);

export type ClientRateRow = typeof clientRate.$inferSelect;


/**
 * The agency's OWN Stripe account, connected through Stripe Connect (Standard
 * account, OAuth). Every statement is a Stripe invoice created on this account
 * with the Stripe-Account header, so the money goes agency <-> client and never
 * through RocketEase. One per organization.
 */
export const agencyBillingAccount = pgTable(
  "agency_billing_account",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    /** acct_… once connected; null while the OAuth round trip is in flight. */
    stripeAccountId: text("stripe_account_id"),
    livemode: boolean("livemode").notNull().default(false),
    scope: text("scope").notNull().default("read_write"),
    status: text("status").$type<"connecting" | "connected" | "disconnected">().notNull().default("connecting"),
    /** Single-use OAuth nonce while connecting. */
    config: jsonb("config").$type<{ oauthNonce?: string; oauthExpiresAt?: string }>().notNull().default({}),
    connectedByUserId: text("connected_by_user_id").references(() => user.id, { onDelete: "set null" }),
    disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agency_billing_account_org_idx").on(t.organizationId)],
);

export type AgencyBillingAccount = typeof agencyBillingAccount.$inferSelect;

/**
 * One client's statement for one month: the lines the Economics row is made
 * of, and the Stripe invoice they became. Status follows the invoice
 * (lib/agency/statement.ts); a void statement frees the month for another.
 */
export const clientStatement = pgTable(
  "client_statement",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    /** YYYY-MM in the agency's working month. */
    period: text("period").notNull(),
    currency: text("currency").notNull(),
    lines: jsonb("lines").$type<StatementLine[]>().notNull().default([]),
    totalCents: integer("total_cents").notNull(),
    status: text("status").$type<StatementStatus>().notNull().default("draft"),
    stripeInvoiceId: text("stripe_invoice_id"),
    stripeInvoiceNumber: text("stripe_invoice_number"),
    hostedInvoiceUrl: text("hosted_invoice_url"),
    billingEmail: text("billing_email"),
    daysUntilDue: integer("days_until_due").notNull().default(30),
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("client_statement_ws_period_idx").on(t.workspaceId, t.period), index("client_statement_org_idx").on(t.organizationId, t.period), uniqueIndex("client_statement_invoice_idx").on(t.stripeInvoiceId)],
);

export type ClientStatement = typeof clientStatement.$inferSelect;
