/*
 * Hashtag sets (M8.9 table stakes).
 *
 * A reusable, workspace-scoped group of tags the composer inserts into the
 * shared text or the first comment. `channelKinds` is advisory — it only says
 * which networks a set was written for. The real ceiling is always the
 * channel's own `limits.hashtagsMax` from @rocketease/providers.
 */
import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { workspace } from "./app";

const id = (name = "id") =>
  text(name)
    .primaryKey()
    .default(sql`gen_random_uuid()`);
const now = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow();

export const hashtagSet = pgTable(
  "hashtag_set",
  {
    id: id(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Stored without the leading "#", in insertion order. */
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    /** Optional network keys ("instagram", "linkedin", …) this set is meant for. Empty = any. */
    channelKinds: jsonb("channel_kinds").$type<string[]>().notNull().default([]),
    usageCount: integer("usage_count").notNull().default(0),
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: now("created_at"),
    updatedAt: now("updated_at"),
  },
  (t) => [uniqueIndex("hashtag_set_ws_name_idx").on(t.workspaceId, t.name), index("hashtag_set_ws_idx").on(t.workspaceId, t.updatedAt)],
);

export type HashtagSet = typeof hashtagSet.$inferSelect;
