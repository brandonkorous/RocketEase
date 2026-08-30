/*
 * Beta feature grants (M12.1).
 *
 * The fourth kind of "no" in the product, and deliberately its own thing:
 *   lib/flags.ts          is this capability switched off?   global, ops
 *   lib/billing/*         has this organization paid?        org, billing
 *   lib/authz.ts can()    is this person allowed?            user role
 *   this                  is this org in this beta?          org, rollout
 *
 * A grant is not an entitlement — nothing has been paid for and there is no
 * plan to attach it to yet. Default is closed: no row and no env entry means
 * no access.
 */
import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organization, user } from "./auth";

export const FEATURE_GRANT_STATES = ["enabled", "disabled"] as const;
export type FeatureGrantState = (typeof FEATURE_GRANT_STATES)[number];

export const featureGrant = pgTable(
  "feature_grant",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /**
     * Dotted key, validated in code against lib/features' BETA_FEATURES rather
     * than by a pg enum: betas come and go, and a migration per beta is friction
     * for no safety a union type doesn't already give.
     */
    feature: text("feature").notNull(),
    /** `disabled` is an explicit revoke — it beats the env bootstrap. */
    state: text("state").$type<FeatureGrantState>().notNull().default("enabled"),
    /** Who let them in. Null once that person leaves; the record outlives them. */
    grantedByUserId: text("granted_by_user_id").references(() => user.id, { onDelete: "set null" }),
    /** Why, in a sentence — shown wherever the grant is listed. */
    note: text("note"),
    /** A time-boxed pilot. Null = open-ended. An expired grant is no access. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("feature_grant_org_feature_idx").on(t.organizationId, t.feature)],
);

export type FeatureGrant = typeof featureGrant.$inferSelect;
