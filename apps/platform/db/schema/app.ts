/*
 * Application tables below the Better Auth layer (db/schema/auth.ts).
 *
 * Tenancy rules from docs/originals/data-model.md:
 *   - Organization = billing/ownership boundary (Better Auth `organization` table).
 *   - Workspace     = brand/client boundary; every workspace-scoped row carries
 *                     organization_id AND workspace_id.
 *   - Timestamps in UTC; the workspace keeps the intended scheduling timezone.
 */
import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organization, user } from "./auth";

const id = (name = "id") =>
  text(name)
    .primaryKey()
    .default(sql`gen_random_uuid()`);
const now = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow();

/** Role presets from docs/originals/permissions.md. Custom grants come later. */
export const WORKSPACE_ROLES = [
  "owner",
  "admin",
  "manager",
  "creator",
  "responder",
  "analyst",
  "client_approver",
  "viewer",
] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];
export const workspaceRole = pgEnum("workspace_role", WORKSPACE_ROLES);

export const workspace = pgTable(
  "workspace",
  {
    id: id(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    timezone: text("timezone").notNull().default("UTC"),
    locale: text("locale").notNull().default("en-US"),
    /** Brand settings, onboarding goals, etc. Shape evolves; keep it opaque here. */
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: now("created_at"),
    updatedAt: now("updated_at"),
  },
  (t) => [
    uniqueIndex("workspace_org_slug_idx").on(t.organizationId, t.slug),
    index("workspace_org_idx").on(t.organizationId),
  ],
);

export const workspaceMembership = pgTable(
  "workspace_membership",
  {
    id: id(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: workspaceRole("role").notNull().default("viewer"),
    /** Explicit per-capability grants for "If granted" cells in the role matrix. */
    grants: jsonb("grants").$type<string[]>().notNull().default([]),
    /** Per-user email opt-in by notification kind; a missing key uses the kind's default. */
    notificationPreferences: jsonb("notification_preferences").$type<Record<string, boolean>>().notNull().default({}),
    pinned: boolean("pinned").notNull().default(false),
    lastOpenedAt: timestamp("last_opened_at", { withTimezone: true }),
    /** Set when SCIM deprovisions the user; access is denied while it is non-null. */
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    createdAt: now("created_at"),
  },
  (t) => [
    uniqueIndex("workspace_membership_ws_user_idx").on(t.workspaceId, t.userId),
    index("workspace_membership_user_idx").on(t.userId),
  ],
);

/**
 * Append-only audit log (permissions.md "Audit requirements"). Never updated or
 * deleted by application code; retention is handled by an operator job.
 */
export const auditEvent = pgTable(
  "audit_event",
  {
    id: id(),
    organizationId: text("organization_id").references(() => organization.id, { onDelete: "set null" }),
    workspaceId: text("workspace_id").references(() => workspace.id, { onDelete: "set null" }),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    /** e.g. "workspace.create", "membership.role_change", "auth.sign_in" */
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    summary: jsonb("summary").$type<{ before?: unknown; after?: unknown; note?: string }>(),
    requestId: text("request_id"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    result: text("result").notNull().default("ok"),
    createdAt: now("created_at"),
  },
  (t) => [
    index("audit_event_org_created_idx").on(t.organizationId, t.createdAt),
    index("audit_event_ws_created_idx").on(t.workspaceId, t.createdAt),
  ],
);

export const invitationStatus = pgEnum("invitation_status", ["pending", "accepted", "revoked", "expired"]);

/**
 * Workspace invitation. Carries the workspace role/grants; on accept we add
 * the user to the organization (Better Auth `member`) and the workspace.
 */
export const workspaceInvitation = pgTable(
  "workspace_invitation",
  {
    id: id(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: workspaceRole("role").notNull().default("viewer"),
    grants: jsonb("grants").$type<string[]>().notNull().default([]),
    /** Opaque, single-use, sent only in the email link. */
    token: text("token").notNull(),
    invitedByUserId: text("invited_by_user_id").references(() => user.id, { onDelete: "set null" }),
    status: invitationStatus("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedByUserId: text("accepted_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: now("created_at"),
  },
  (t) => [
    uniqueIndex("workspace_invitation_token_idx").on(t.token),
    index("workspace_invitation_ws_idx").on(t.workspaceId, t.status),
  ],
);

/** In-app notification center (COL-003). Deep-links to the exact object. */
export const notification = pgTable(
  "notification",
  {
    id: id(),
    organizationId: text("organization_id").notNull(),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    href: text("href"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: now("created_at"),
  },
  (t) => [index("notification_user_unread_idx").on(t.userId, t.workspaceId, t.readAt)],
);

/**
 * Transactional outbox. Rows are written in the same transaction as the domain
 * change and relayed into pg-boss by the worker (lib/jobs/outbox.ts).
 */
export const outboxEvent = pgTable(
  "outbox_event",
  {
    id: id(),
    jobName: text("job_name").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    organizationId: text("organization_id"),
    workspaceId: text("workspace_id"),
    dedupeKey: text("dedupe_key"),
    runAt: timestamp("run_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    relayedAt: timestamp("relayed_at", { withTimezone: true }),
    createdAt: now("created_at"),
  },
  (t) => [index("outbox_event_pending_idx").on(t.createdAt).where(sql`${t.relayedAt} is null`)],
);

/**
 * Step-up re-authentication (NFR-001). A high-risk action (paid spend) needs a
 * password or TOTP re-entry, or an SSO round trip, within a short window. Rows
 * are keyed by the Better Auth session id so the proof dies with the session;
 * expired rows are pruned on write. Never holds the secret itself.
 */
export const stepUpVerification = pgTable(
  "step_up_verification",
  {
    id: id(),
    sessionId: text("session_id").notNull(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    /** How it was re-verified: "password", "totp" or "sso". */
    method: text("method").notNull(),
    /** Scope of the proof, e.g. "paid_spend". */
    purpose: text("purpose").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: now("created_at"),
  },
  (t) => [index("step_up_session_idx").on(t.sessionId, t.purpose, t.expiresAt)],
);

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

export type Workspace = typeof workspace.$inferSelect;
export type WorkspaceMembership = typeof workspaceMembership.$inferSelect;
export type AuditEvent = typeof auditEvent.$inferSelect;
export type StepUpVerification = typeof stepUpVerification.$inferSelect;
export type ScimToken = typeof scimToken.$inferSelect;
export type ScimIdentity = typeof scimIdentity.$inferSelect;
