/*
 * Data-quality issues (analytics.md "Data quality", 5.7). One row per open
 * finding; the daily `quality.check` job upserts by (workspace, kind, subject)
 * and resolves rows it no longer observes.
 */
import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organization } from "./auth";
import { workspace } from "./app";

// `definition_break` is informational: a provider changed what a metric counts mid-series.
export const QUALITY_KINDS = ["freshness", "duplicate", "implausible", "revised", "reconciliation", "definition_break"] as const;
export type QualityKind = (typeof QUALITY_KINDS)[number];

export const dataQualityIssue = pgTable(
  "data_quality_issue",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    kind: text("kind").$type<QualityKind>().notNull(),
    /** What the finding is about: a channel id, a metric key, or "workspace". */
    subject: text("subject").notNull(),
    severity: text("severity").$type<"info" | "warning" | "error">().notNull().default("warning"),
    message: text("message").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("data_quality_issue_key_idx").on(t.workspaceId, t.kind, t.subject), index("data_quality_issue_open_idx").on(t.workspaceId, t.resolvedAt)],
);

export type DataQualityIssue = typeof dataQualityIssue.$inferSelect;
