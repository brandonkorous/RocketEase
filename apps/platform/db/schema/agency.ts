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
import { index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { workspace } from "./app";
// Relative, not aliased: drizzle-kit reads this file outside the Next.js path map.
import type { ClientBillingModel } from "../../lib/agency/margin";

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
