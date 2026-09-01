/*
 * AI usage ledger (M8.9). One row per completion — the record every billing
 * surface reads. Credits are the billed unit: 1 credit = 1,000 output tokens,
 * input tokens at a fifth of that (lib/ai/usage/credits.ts).
 *
 * There is deliberately no `ai_price` table: prices are deployment config in
 * lib/ai/usage/prices.ts, so an unpriced model stores credits and a null cost
 * rather than a guessed zero.
 */
import { sql } from "drizzle-orm";
import { index, integer, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { workspace } from "./app";

export const AI_USAGE_KINDS = ["caption", "repurpose", "reply", "generate_post", "generate_ad", "generate_image", "generate_video", "other"] as const;
export type AiUsageKind = (typeof AI_USAGE_KINDS)[number];

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    /** Who asked. Null for background work, and the row outlives the person leaving. */
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    kind: text("kind").$type<AiUsageKind>().notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    credits: numeric("credits", { precision: 12, scale: 4 }).notNull().default("0"),
    /** Null when the model has no configured price — never a guessed 0. */
    costUsd: numeric("cost_usd", { precision: 12, scale: 6 }),
    /** The provider's request id, for reconciling a disputed line. */
    requestId: text("request_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ai_usage_workspace_created_idx").on(t.workspaceId, t.createdAt),
    index("ai_usage_org_created_idx").on(t.organizationId, t.createdAt),
  ],
);

export type AiUsage = typeof aiUsage.$inferSelect;
