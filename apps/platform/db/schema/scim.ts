import { boolean, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { id, now, workspace } from "./app";

/**
 * SCIM 2.0 provisioning credential, one active row per organization. Only the
 * SHA-256 of the bearer token is kept — the plaintext is shown once when it is
 * minted and can never be read back. `prefix` is the display stub in Settings.
 */
export const scimToken = pgTable(
  "scim_token",
  {
    id: id(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** Hex SHA-256 of the bearer token. Never the token itself. */
    tokenHash: text("token_hash").notNull(),
    /** First few characters, for "which token is this?" in the UI. */
    prefix: text("prefix").notNull(),
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: now("created_at"),
  },
  (t) => [uniqueIndex("scim_token_hash_idx").on(t.tokenHash), index("scim_token_org_idx").on(t.organizationId)],
);

/**
 * SCIM `User` resource ↔ Better Auth user, scoped to one organization. Holds
 * the IdP's `externalId` and the SCIM `active` flag; workspace access still
 * lives in workspace_membership (driven by SCIM `Group` membership).
 */
export const scimIdentity = pgTable(
  "scim_identity",
  {
    id: id(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Stable id from the identity provider. Unique per organization when present. */
    externalId: text("external_id"),
    userName: text("user_name").notNull(),
    active: boolean("active").notNull().default(true),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: now("created_at"),
    updatedAt: now("updated_at"),
  },
  (t) => [
    uniqueIndex("scim_identity_org_user_idx").on(t.organizationId, t.userId),
    uniqueIndex("scim_identity_org_username_idx").on(t.organizationId, t.userName),
    index("scim_identity_org_external_idx").on(t.organizationId, t.externalId),
  ],
);

export type ScimToken = typeof scimToken.$inferSelect;
export type ScimIdentity = typeof scimIdentity.$inferSelect;
