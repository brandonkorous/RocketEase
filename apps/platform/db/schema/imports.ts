/*
 * Import sources (M14.9): an outside design tool a PERSON connects so their
 * designs can be brought into the library. Canva first (Connect API). The
 * credential is per Canva user, so a source belongs to the member who
 * connected it, inside one workspace; the envelope is bound to the row id like
 * provider_connection.secret and tracking_source.secret.
 */
import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { workspace } from "./app";
import type { SecretEnvelope } from "./connections";

const id = (name = "id") => text(name).primaryKey().default(sql`gen_random_uuid()`);
const now = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow();

export const IMPORT_KINDS = ["canva"] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];

/** integrations.md connection states, the ones an OAuth-only source reaches. */
export const IMPORT_STATUSES = ["connecting", "healthy", "action_required", "disconnected"] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];

export type ImportConfig = {
  /** Single-use OAuth nonce and the PKCE verifier while status = connecting; cleared on callback. */
  oauthNonce?: string;
  oauthExpiresAt?: string;
  codeVerifier?: string;
  /** canva: ids the Connect API reports for the account. */
  canvaUserId?: string;
  canvaTeamId?: string;
};

export type ImportHealth = { ok: boolean; message?: string; lastCheckedAt?: string };

export const importSource = pgTable(
  "import_source",
  {
    id: id(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    kind: text("kind").$type<ImportKind>().notNull(),
    /** The account's display name at the tool, e.g. the Canva user's name. */
    name: text("name").notNull(),
    status: text("status").$type<ImportStatus>().notNull().default("connecting"),
    config: jsonb("config").$type<ImportConfig>().notNull().default({}),
    /** Encrypted credential JSON (access token, refresh token, expiry, scopes). */
    secret: jsonb("secret").$type<SecretEnvelope>(),
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
    health: jsonb("health").$type<ImportHealth>().notNull().default({ ok: true }),
    lastError: text("last_error"),
    /** Whose account this is. The source goes with the person. */
    createdByUserId: text("created_by_user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),
    createdAt: now("created_at"),
    updatedAt: now("updated_at"),
  },
  (t) => [index("import_source_ws_idx").on(t.workspaceId, t.kind), uniqueIndex("import_source_ws_kind_user_idx").on(t.workspaceId, t.kind, t.createdByUserId)],
);

export type ImportSource = typeof importSource.$inferSelect;
