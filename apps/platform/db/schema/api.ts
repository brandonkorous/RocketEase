import { index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { id, now, workspace } from "./app";

/**
 * Public API credential (docs/api.md). Workspace-scoped: one key acts inside
 * exactly one workspace, with a subset of its creator's capabilities as
 * `scopes`. Only the SHA-256 of the token is stored — the plaintext is shown
 * once at creation. A key never widens what its creator may do: every request
 * re-checks the creator's live membership, so a demotion or deprovision
 * narrows the key immediately.
 */
export const apiKey = pgTable(
  "api_key",
  {
    id: id(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Hex SHA-256 of the bearer token. Never the token itself. */
    keyHash: text("key_hash").notNull(),
    /** Display stub, e.g. "rke_a1b2c3". */
    prefix: text("prefix").notNull(),
    /** Capability keys from lib/authz.ts; always a subset of the creator's own. */
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: now("created_at"),
  },
  (t) => [uniqueIndex("api_key_hash_idx").on(t.keyHash), index("api_key_ws_idx").on(t.workspaceId, t.revokedAt)],
);

export type ApiKey = typeof apiKey.$inferSelect;
