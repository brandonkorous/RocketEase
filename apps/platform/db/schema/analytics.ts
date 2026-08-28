/*
 * Analytics (analytics.md, data-model.md "Paid and analytics").
 * `metric_fact` is the single grain store: one row per entity × metric × day.
 * Re-ingested values that differ bump `revision` so reports can flag changes.
 */
import { sql } from "drizzle-orm";
import { index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
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
    format: text("format").$type<"csv">().notNull().default("csv"),
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

export type MetricFact = typeof metricFact.$inferSelect;
export type ReportDefinition = typeof reportDefinition.$inferSelect;
export type ReportRun = typeof reportRun.$inferSelect;
