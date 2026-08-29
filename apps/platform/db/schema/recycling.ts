/*
 * Evergreen recycling (M8.9; SocialBee-style category recycling).
 *
 * A rule re-posts already-published content on a cadence. The human gate is the
 * default: a run creates a DRAFT unless the workspace turned
 * `settings.recycling.autoSchedule` on. Every run is logged, and the log is what
 * makes the job idempotent — `occurrence` (one slot per rule) and
 * `occurrenceKey` (rule + item + slot) are both unique, so a redelivered
 * `recycle.tick` can never produce a second copy.
 */
import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { workspace } from "./app";

const id = (name = "id") =>
  text(name)
    .primaryKey()
    .default(sql`gen_random_uuid()`);
const now = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });
const scoped = () => ({
  organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
});

export const recycleRule = pgTable(
  "recycle_rule",
  {
    id: id(),
    ...scoped(),
    name: text("name").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    /** Category filter: item must carry at least one of these tag ids. Empty = any. */
    tagIds: jsonb("tag_ids").$type<string[]>().notNull().default([]),
    /** Destinations for the recycled copy; also filters candidates. Empty = the source's own channels. */
    channelIds: jsonb("channel_ids").$type<string[]>().notNull().default([]),
    /** Cadence: fire every N days at `atTime` in the workspace timezone. */
    everyDays: integer("every_days").notNull().default(30),
    atTime: text("at_time").notNull().default("09:00"),
    maxRepeatsPerItem: integer("max_repeats_per_item").notNull().default(3),
    pauseUntil: ts("pause_until"),
    lastRunAt: ts("last_run_at"),
    runCount: integer("run_count").notNull().default(0),
    /** The rule acts as this person; the worker re-checks their capabilities. */
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: now("created_at"),
    updatedAt: now("updated_at"),
  },
  (t) => [index("recycle_rule_ws_enabled_idx").on(t.workspaceId, t.enabled)],
);

export const RECYCLE_OUTCOMES = ["created", "scheduled", "skipped", "failed"] as const;
export type RecycleOutcome = (typeof RECYCLE_OUTCOMES)[number];
export const recycleOutcome = pgEnum("recycle_outcome", RECYCLE_OUTCOMES);

export const recycleRun = pgTable(
  "recycle_run",
  {
    id: id(),
    ...scoped(),
    ruleId: text("rule_id").notNull().references(() => recycleRule.id, { onDelete: "cascade" }),
    /** Local slot the run belongs to, "YYYY-MM-DDTHH:mm" in the workspace timezone. */
    occurrence: text("occurrence").notNull(),
    /** `${ruleId}:${sourceItemId}:${occurrence}` — the deterministic idempotency key. */
    occurrenceKey: text("occurrence_key").notNull(),
    sourceItemId: text("source_item_id"),
    newItemId: text("new_item_id"),
    outcome: recycleOutcome("outcome").notNull().default("created"),
    /** Why nothing was created, or what was skipped, in the user's words. */
    reason: text("reason"),
    scheduledFor: ts("scheduled_for"),
    createdAt: now("created_at"),
  },
  (t) => [
    uniqueIndex("recycle_run_rule_occurrence_idx").on(t.ruleId, t.occurrence),
    uniqueIndex("recycle_run_key_idx").on(t.occurrenceKey),
    index("recycle_run_ws_created_idx").on(t.workspaceId, t.createdAt),
  ],
);

export type RecycleRule = typeof recycleRule.$inferSelect;
export type RecycleRun = typeof recycleRun.$inferSelect;
