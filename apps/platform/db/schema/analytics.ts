/*
 * Analytics (analytics.md, data-model.md "Paid and analytics").
 * `metric_fact` is the single grain store: one row per entity × metric × day.
 * Re-ingested values that differ bump `revision` so reports can flag changes.
 */
import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { CanonicalMetric } from "@make-it-social/providers";
import { organization, user } from "./auth";
import { workspace } from "./app";
import { channel } from "./connections";

const id = (name = "id") => text(name).primaryKey().default(sql`gen_random_uuid()`);
const now = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow();
const scoped = () => ({
  organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
});

export const metricFact = pgTable(
  "metric_fact",
  {
    id: id(),
    ...scoped(),
    channelId: text("channel_id").notNull().references(() => channel.id, { onDelete: "cascade" }),
    entity: text("entity").$type<"channel" | "post">().notNull(),
    /** Remote post id for post facts; "" for channel facts (part of the unique key). */
    remoteId: text("remote_id").notNull().default(""),
    metric: text("metric").$type<CanonicalMetric>().notNull(),
    day: text("day").notNull(),
    value: numeric("value", { precision: 18, scale: 2 }).notNull(),
    /** organic | paid — paid arrives with M6 ad imports. */
    scope: text("scope").$type<"organic" | "paid">().notNull().default("organic"),
    source: text("source").notNull(),
    revision: integer("revision").notNull().default(1),
    freshAt: now("fresh_at"),
    createdAt: now("created_at"),
  },
  (t) => [
    uniqueIndex("metric_fact_grain_idx").on(t.channelId, t.entity, t.remoteId, t.metric, t.day, t.scope),
    index("metric_fact_ws_day_idx").on(t.workspaceId, t.day, t.metric),
    index("metric_fact_post_idx").on(t.workspaceId, t.entity, t.remoteId),
  ],
);

export type ReportFilters = { from: string; to: string; compare: "previous" | "year" | "none"; channelId?: string; campaignId?: string; scope: "all" | "organic" | "paid" };
export type ReportCadence = "none" | "daily" | "weekly" | "monthly";
/** csv = the analyst export; html = the branded client document (PDF alongside it when a renderer is configured). */
export type ReportFormat = "csv" | "html";

export const reportDefinition = pgTable(
  "report_definition",
  {
    id: id(),
    ...scoped(),
    name: text("name").notNull(),
    /** Saved view: filters are relative when `rolling` (e.g. last 7 days) so schedules stay useful. */
    filters: jsonb("filters").$type<ReportFilters>().notNull(),
    rollingDays: integer("rolling_days"),
    columns: jsonb("columns").$type<string[]>().notNull().default([]),
    cadence: text("cadence").$type<ReportCadence>().notNull().default("none"),
    recipients: jsonb("recipients").$type<string[]>().notNull().default([]),
    format: text("format").$type<ReportFormat>().notNull().default("csv"),
    /** Client-facing: branded document, external recipients allowed, share link offered. */
    clientFacing: boolean("client_facing").notNull().default(false),
    /** External addresses; only rows verified in `external_recipient` are delivered to. */
    externalRecipients: jsonb("external_recipients").$type<string[]>().notNull().default([]),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: now("created_at"),
    updatedAt: now("updated_at"),
  },
  (t) => [index("report_definition_ws_idx").on(t.workspaceId, t.name), index("report_definition_due_idx").on(t.nextRunAt)],
);

export const reportRun = pgTable(
  "report_run",
  {
    id: id(),
    ...scoped(),
    definitionId: text("definition_id").references(() => reportDefinition.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    status: text("status").$type<"queued" | "running" | "done" | "failed">().notNull().default("queued"),
    /** Exact filters used, resolved to absolute dates, plus definitions version + freshness. */
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull().default({}),
    format: text("format").notNull().default("csv"),
    objectKey: text("object_key"),
    sizeBytes: integer("size_bytes"),
    recipients: jsonb("recipients").$type<string[]>().notNull().default([]),
    error: text("error"),
    requestedByUserId: text("requested_by_user_id").references(() => user.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: now("created_at"),
  },
  (t) => [index("report_run_ws_idx").on(t.workspaceId, t.createdAt)],
);

/**
 * A signed, expiring, revocable link to one generated report run (analytics.md
 * "Reports": clients see the artifact, never the workspace). The URL carries an
 * opaque token; only its hash is stored, so a database read cannot mint a link.
 * No organization or workspace id ever appears in the URL.
 */
export const reportShare = pgTable(
  "report_share",
  {
    id: id(),
    ...scoped(),
    runId: text("run_id").notNull().references(() => reportRun.id, { onDelete: "cascade" }),
    /** sha256 of the opaque token. The token itself is shown once, at creation. */
    tokenHash: text("token_hash").notNull(),
    /** Optional second factor for the link; scrypt-style hash, never the passcode. */
    passcodeHash: text("passcode_hash"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedByUserId: text("revoked_by_user_id").references(() => user.id, { onDelete: "set null" }),
    viewCount: integer("view_count").notNull().default(0),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: now("created_at"),
  },
  (t) => [uniqueIndex("report_share_token_idx").on(t.tokenHash), index("report_share_run_idx").on(t.runId)],
);

/**
 * Double opt-in for addresses outside the workspace (permissions.md: a client
 * report may only leave the tenant to someone who asked for it). Unverified
 * rows are skipped at run time and shown as pending in the report form.
 */
export const externalRecipient = pgTable(
  "external_recipient",
  {
    id: id(),
    ...scoped(),
    email: text("email").notNull(),
    status: text("status").$type<"pending" | "verified" | "revoked">().notNull().default("pending"),
    /** sha256 of the single-use verification token sent in the opt-in email. */
    verificationTokenHash: text("verification_token_hash"),
    verificationSentAt: timestamp("verification_sent_at", { withTimezone: true }),
    verificationExpiresAt: timestamp("verification_expires_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    /** Truncated proof of the opt-in click, for the audit trail. */
    verifiedFrom: text("verified_from"),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
    requestedByUserId: text("requested_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: now("created_at"),
  },
  (t) => [uniqueIndex("external_recipient_ws_email_idx").on(t.workspaceId, t.email), index("external_recipient_token_idx").on(t.verificationTokenHash)],
);

export type MetricFact = typeof metricFact.$inferSelect;
export type ReportShare = typeof reportShare.$inferSelect;
export type ExternalRecipient = typeof externalRecipient.$inferSelect;
export type ReportDefinition = typeof reportDefinition.$inferSelect;
export type ReportRun = typeof reportRun.$inferSelect;
