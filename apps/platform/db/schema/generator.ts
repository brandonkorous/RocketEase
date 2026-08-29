/*
 * Saved generator briefs (M8.9). A brief is what the marketer typed, kept so a
 * run can be repeated next month without retyping it. It holds no model output
 * and never becomes a post on its own.
 */
import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { workspace } from "./app";

export const generatorBrief = pgTable(
  "generator_brief",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    /** Short label the person recognises in the "rerun" list. */
    name: text("name").notNull(),
    /** The Brief object from lib/ai/generator/types.ts, as typed. */
    brief: jsonb("brief").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("generator_brief_ws_created_idx").on(t.workspaceId, t.createdAt)],
);

export type GeneratorBrief = typeof generatorBrief.$inferSelect;
