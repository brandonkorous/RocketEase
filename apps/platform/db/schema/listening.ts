/*
 * Listening (M14.11): saved keyword queries, the public posts they matched,
 * and a record of every check per network so the screen can say when a
 * network was last searched and why it was not. A hit is one public post
 * that matched at check time; a later edit or deletion at the network is
 * not seen. Nothing here is a mention of the workspace's own accounts —
 * those are the inbox.
 */
import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { workspace } from "./app";
// Relative, not aliased: drizzle-kit reads this file outside the Next.js path map.
import type { ListeningNetwork } from "../../lib/listening/coverage";

const id = (name = "id") => text(name).primaryKey().default(sql`gen_random_uuid()`);
const now = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });
const scoped = () => ({
  organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
});

export const listeningQuery = pgTable(
  "listening_query",
  {
    id: id(),
    ...scoped(),
    name: text("name").notNull(),
    /** Words or quoted phrases, searched one at a time on every network listed. */
    terms: jsonb("terms").$type<string[]>().notNull().default([]),
    networks: jsonb("networks").$type<ListeningNetwork[]>().notNull().default([]),
    enabled: boolean("enabled").notNull().default(true),
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    lastCheckedAt: ts("last_checked_at"),
    createdAt: now("created_at"),
    updatedAt: now("updated_at"),
  },
  (t) => [index("listening_query_ws_idx").on(t.workspaceId, t.enabled)],
);

export type ListeningAuthor = { name: string; handle?: string; url?: string };

export const listeningHit = pgTable(
  "listening_hit",
  {
    id: id(),
    ...scoped(),
    queryId: text("query_id").notNull().references(() => listeningQuery.id, { onDelete: "cascade" }),
    network: text("network").$type<ListeningNetwork>().notNull(),
    /** The network's own id for the post (a Bluesky at:// uri, a Threads post id, a YouTube video id). */
    remoteId: text("remote_id").notNull(),
    /** Which of the query's terms matched; the first one that did. */
    term: text("term").notNull(),
    author: jsonb("author").$type<ListeningAuthor>().notNull(),
    text: text("text").notNull(),
    url: text("url"),
    occurredAt: ts("occurred_at").notNull(),
    capturedAt: now("captured_at"),
    /** Hidden from the feed by a person; the row stays so the same post is not captured again. */
    hidden: boolean("hidden").notNull().default(false),
  },
  (t) => [uniqueIndex("listening_hit_query_remote_idx").on(t.queryId, t.network, t.remoteId), index("listening_hit_query_time_idx").on(t.queryId, t.occurredAt)],
);

export const CHECK_STATUSES = ["ok", "skipped", "failed"] as const;
export type CheckStatus = (typeof CHECK_STATUSES)[number];

/** One network's part of one check: what happened, in the network's words when it refused. */
export const listeningCheck = pgTable(
  "listening_check",
  {
    id: id(),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    queryId: text("query_id").notNull().references(() => listeningQuery.id, { onDelete: "cascade" }),
    network: text("network").$type<ListeningNetwork>().notNull(),
    status: text("status").$type<CheckStatus>().notNull(),
    /** New hits this check added. */
    hits: integer("hits").notNull().default(0),
    note: text("note"),
    checkedAt: now("checked_at"),
  },
  (t) => [index("listening_check_query_idx").on(t.queryId, t.checkedAt)],
);

export type ListeningQuery = typeof listeningQuery.$inferSelect;
export type ListeningHit = typeof listeningHit.$inferSelect;
export type ListeningCheck = typeof listeningCheck.$inferSelect;
