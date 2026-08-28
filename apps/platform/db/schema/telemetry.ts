/*
 * Product telemetry (analytics.md "Product analytics telemetry", 5.8).
 * Privacy-safe by construction: opaque ids, surface, outcome, latency and a
 * schema version. Never message bodies, post text, tokens, or emails.
 */
import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const PRODUCT_EVENTS = [
  "workspace_created",
  "channel_connected",
  "draft_created",
  "approval_requested",
  "approval_decided",
  "post_scheduled",
  "post_published",
  "post_failed",
  "conversation_replied",
  "conversation_resolved",
  "campaign_created",
  "report_saved",
  "report_exported",
  "onboarding_step_completed",
] as const;
export type ProductEventName = (typeof PRODUCT_EVENTS)[number];

export const productEvent = pgTable(
  "product_event",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    event: text("event").$type<ProductEventName>().notNull(),
    /** Opaque ids only — joinable internally, meaningless outside. */
    userId: text("user_id"),
    organizationId: text("organization_id"),
    workspaceId: text("workspace_id"),
    /** Where it happened: "web" (request) or "worker" (job), plus an optional route/handler. */
    surface: text("surface").notNull(),
    outcome: text("outcome").$type<"ok" | "error" | "denied">().notNull().default("ok"),
    latencyMs: integer("latency_ms"),
    /** Small, allow-listed scalar props (network, format, step, category…). */
    props: jsonb("props").$type<Record<string, string | number | boolean | null>>().notNull().default({}),
    schemaVersion: integer("schema_version").notNull().default(1),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("product_event_name_time_idx").on(t.event, t.occurredAt), index("product_event_ws_idx").on(t.workspaceId, t.occurredAt)],
);

export type ProductEvent = typeof productEvent.$inferSelect;
