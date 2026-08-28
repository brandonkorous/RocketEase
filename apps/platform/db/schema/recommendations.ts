/*
 * Recommendations and best-time slots (roadmap.md Phase 5 "Improve").
 *
 * Every row is COMPUTED from stored facts — never invented. `evidence` carries
 * the numbers, the period, the sample sizes and the metric definitions version
 * that produced the row, so the UI can always answer "why we think this".
 * Rows expire; the nightly `recommendations.compute` job rewrites them.
 */
import { sql } from "drizzle-orm";
import { index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { workspace } from "./app";
import { channel } from "./connections";
import { contentItem } from "./content";

const id = (name = "id") => text(name).primaryKey().default(sql`gen_random_uuid()`);
const now = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow();

export const RECOMMENDATION_KINDS = ["cadence_gap", "format_performance", "reuse_candidate", "declining_trend", "inbox_response_load", "audience_growth_stall"] as const;
export type RecommendationKind = (typeof RECOMMENDATION_KINDS)[number];

export const RECOMMENDATION_STATUSES = ["open", "dismissed", "applied"] as const;
export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number];

export type Confidence = "low" | "medium" | "high";

/** One measured number behind a recommendation. `unit` drives formatting only. */
export type EvidenceMetric = { label: string; value: number; unit?: "count" | "percent" | "days" | "ratio" };

export type Evidence = {
  metrics: EvidenceMetric[];
  /** Absolute window the numbers were computed over. */
  period: { from: string; to: string };
  /** Sample sizes: what "n" each number rests on. */
  samples: { label: string; n: number }[];
  /** METRICS registry version (lib/analytics/metrics.ts) at compute time. */
  definitionsVersion: string;
  note?: string;
};

/** Where the recommendation sends the user. `segment` is a workspace-relative route. */
export type RecommendationAction = { label: string; segment: string; query?: Record<string, string> };

export const recommendation = pgTable(
  "recommendation",
  {
    id: id(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    kind: text("kind").$type<RecommendationKind>().notNull(),
    /** Dedupe key within a kind: a channel id, a format key, an item id, or "workspace". */
    target: text("target").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    evidence: jsonb("evidence").$type<Evidence>().notNull(),
    confidence: text("confidence").$type<Confidence>().notNull().default("low"),
    action: jsonb("action").$type<RecommendationAction>(),
    status: text("status").$type<RecommendationStatus>().notNull().default("open"),
    channelId: text("channel_id").references(() => channel.id, { onDelete: "cascade" }),
    contentItemId: text("content_item_id").references(() => contentItem.id, { onDelete: "cascade" }),
    decidedByUserId: text("decided_by_user_id").references(() => user.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    computedAt: now("computed_at"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("recommendation_key_idx").on(t.workspaceId, t.kind, t.target),
    index("recommendation_ws_open_idx").on(t.workspaceId, t.status, t.expiresAt),
  ],
);

/**
 * Best publishing times per channel: mean engagement rate of posts published in
 * that weekday × hour bucket (workspace timezone). Only buckets that met the
 * minimum sample are stored — an empty table means "not enough data", never zero.
 */
export const bestTimeSlot = pgTable(
  "best_time_slot",
  {
    id: id(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    channelId: text("channel_id").notNull().references(() => channel.id, { onDelete: "cascade" }),
    /** 0 = Sunday … 6 = Saturday, in the workspace timezone. */
    weekday: integer("weekday").notNull(),
    hour: integer("hour").notNull(),
    /** Mean engagement rate (engagement ÷ reach) of the posts in this bucket. */
    score: numeric("score", { precision: 12, scale: 6 }).notNull(),
    sampleSize: integer("sample_size").notNull(),
    computedAt: now("computed_at"),
  },
  (t) => [
    uniqueIndex("best_time_slot_key_idx").on(t.channelId, t.weekday, t.hour),
    index("best_time_slot_ws_idx").on(t.workspaceId, t.channelId),
  ],
);

export type Recommendation = typeof recommendation.$inferSelect;
export type BestTimeSlot = typeof bestTimeSlot.$inferSelect;
