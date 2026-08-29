/*
 * Connections (docs/originals/data-model.md "Connections", integrations.md).
 * Secrets never live here in plaintext: `provider_connection.secret` is an
 * AES-256-GCM envelope produced by lib/crypto.ts.
 */
import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { workspace } from "./app";
import type { Capabilities, ChannelKind, Network, ProviderKey } from "@make-it-social/providers";

const id = (name = "id") =>
  text(name)
    .primaryKey()
    .default(sql`gen_random_uuid()`);
const now = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow();

export const PROVIDER_KEYS = ["mock", "meta", "linkedin", "tiktok", "youtube", "pinterest", "x", "google_business"] as const satisfies readonly ProviderKey[];
export const providerKey = pgEnum("provider_key", PROVIDER_KEYS);

/** integrations.md "Connection states" */
export const CHANNEL_STATUSES = ["connecting", "syncing", "healthy", "degraded", "action_required", "revoked", "disconnected"] as const;
export type ChannelStatus = (typeof CHANNEL_STATUSES)[number];
export const channelStatus = pgEnum("channel_status", CHANNEL_STATUSES);

export const CONNECTION_STATUSES = ["selecting", "active", "expired", "revoked", "disconnected"] as const;
export const connectionStatus = pgEnum("connection_status", CONNECTION_STATUSES);

export type SecretEnvelope = { v: 1; keyId: string; iv: string; tag: string; ct: string };

export const providerConnection = pgTable(
  "provider_connection",
  {
    id: id(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    provider: providerKey("provider").notNull(),
    providerUserId: text("provider_user_id").notNull(),
    providerUserName: text("provider_user_name"),
    /** Encrypted Credential JSON. */
    secret: jsonb("secret").$type<SecretEnvelope>().notNull(),
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    status: connectionStatus("status").notNull().default("selecting"),
    lastError: text("last_error"),
    lastRefreshedAt: timestamp("last_refreshed_at", { withTimezone: true }),
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: now("created_at"),
    updatedAt: now("updated_at"),
  },
  (t) => [index("provider_connection_ws_idx").on(t.workspaceId, t.provider)],
);

export type ChannelHealth = {
  tokenOk: boolean;
  permissionsOk: boolean;
  lastCheckedAt?: string;
  message?: string;
  errorCategory?: string;
};

export const channel = pgTable(
  "channel",
  {
    id: id(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    connectionId: text("connection_id")
      .notNull()
      .references(() => providerConnection.id, { onDelete: "cascade" }),
    provider: providerKey("provider").notNull(),
    network: text("network").$type<Network>().notNull(),
    kind: text("kind").$type<ChannelKind>().notNull(),
    remoteId: text("remote_id").notNull(),
    name: text("name").notNull(),
    handle: text("handle"),
    avatarUrl: text("avatar_url"),
    /** Per-channel token (e.g. Facebook Page token), encrypted like the connection secret. */
    channelSecret: jsonb("channel_secret").$type<SecretEnvelope>(),
    capabilities: jsonb("capabilities").$type<Capabilities>().notNull(),
    status: channelStatus("status").notNull().default("connecting"),
    health: jsonb("health").$type<ChannelHealth>().notNull().default({ tokenOk: true, permissionsOk: true }),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),
    createdAt: now("created_at"),
    updatedAt: now("updated_at"),
  },
  (t) => [
    // Same remote channel may be re-connected; keep one live row per workspace.
    uniqueIndex("channel_ws_remote_idx").on(t.workspaceId, t.provider, t.remoteId),
    index("channel_ws_status_idx").on(t.workspaceId, t.status),
  ],
);

export const syncCursor = pgTable(
  "sync_cursor",
  {
    id: id(),
    channelId: text("channel_id")
      .notNull()
      .references(() => channel.id, { onDelete: "cascade" }),
    /** e.g. "inbox.comments", "insights.daily", "posts" */
    resource: text("resource").notNull(),
    cursor: text("cursor"),
    freshAt: timestamp("fresh_at", { withTimezone: true }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastError: text("last_error"),
    attempts: integer("attempts").notNull().default(0),
    updatedAt: now("updated_at"),
  },
  (t) => [uniqueIndex("sync_cursor_channel_resource_idx").on(t.channelId, t.resource)],
);

export const webhookReceipt = pgTable(
  "webhook_receipt",
  {
    id: id(),
    provider: providerKey("provider").notNull(),
    /** Provider event id — dedupe key. */
    eventId: text("event_id").notNull(),
    channelRemoteId: text("channel_remote_id"),
    signatureOk: text("signature_ok").notNull().default("true"),
    payload: jsonb("payload").notNull(),
    receivedAt: now("received_at"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    error: text("error"),
  },
  (t) => [uniqueIndex("webhook_receipt_event_idx").on(t.provider, t.eventId), index("webhook_receipt_pending_idx").on(t.receivedAt)],
);

/** Short-lived OAuth state (integrations.md "Connection flow" step 2). */
export const oauthState = pgTable(
  "oauth_state",
  {
    id: id(),
    provider: providerKey("provider").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    nonce: text("nonce").notNull(),
    /** Reconnecting an existing connection keeps its id. */
    reconnectConnectionId: text("reconnect_connection_id"),
    redirectTo: text("redirect_to"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: now("created_at"),
  },
  (t) => [index("oauth_state_expires_idx").on(t.expiresAt)],
);

export type ProviderConnection = typeof providerConnection.$inferSelect;
export type Channel = typeof channel.$inferSelect;
