/*
 * Link-in-bio (M14.5): one public page per workspace at /l/:slug, its ordered
 * links, and the click log. A click is a ROW, never a counter, so every count
 * is a recount and a day boundary is the workspace's, not UTC's.
 */
import { sql } from "drizzle-orm";
import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organization } from "./auth";
import { workspace } from "./app";
import { channel } from "./connections";

const id = (name = "id") =>
  text(name)
    .primaryKey()
    .default(sql`gen_random_uuid()`);
const now = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow();

export const BUTTON_STYLES = ["black", "brand"] as const;
export type ButtonStyle = (typeof BUTTON_STYLES)[number];
export const AVATAR_SOURCES = ["logo", "none"] as const;
export type AvatarSource = (typeof AVATAR_SOURCES)[number];

export const bioPage = pgTable(
  "bio_page",
  {
    id: id(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    /** Globally unique: the public address is /l/:slug. */
    slug: text("slug").notNull(),
    live: boolean("live").notNull().default(false),
    name: text("name").notNull(),
    bio: text("bio").notNull().default(""),
    avatar: text("avatar").$type<AvatarSource>().notNull().default("logo"),
    buttonStyle: text("button_style").$type<ButtonStyle>().notNull().default("black"),
    showPosts: boolean("show_posts").notNull().default(true),
    postsChannelId: text("posts_channel_id").references(() => channel.id, { onDelete: "set null" }),
    createdAt: now("created_at"),
    updatedAt: now("updated_at"),
  },
  (t) => [uniqueIndex("bio_page_slug_idx").on(t.slug), uniqueIndex("bio_page_workspace_idx").on(t.workspaceId)],
);

export const bioLink = pgTable(
  "bio_link",
  {
    id: id(),
    organizationId: text("organization_id").notNull(),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    pageId: text("page_id").notNull().references(() => bioPage.id, { onDelete: "cascade" }),
    title: text("title").notNull().default(""),
    url: text("url").notNull().default(""),
    position: integer("position").notNull().default(0),
    /** Off = hidden from the public page but kept, with its counts. */
    enabled: boolean("enabled").notNull().default(true),
    createdAt: now("created_at"),
    updatedAt: now("updated_at"),
  },
  (t) => [index("bio_link_page_idx").on(t.pageId, t.position)],
);

export const bioLinkClick = pgTable(
  "bio_link_click",
  {
    id: id(),
    organizationId: text("organization_id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    pageId: text("page_id").notNull().references(() => bioPage.id, { onDelete: "cascade" }),
    linkId: text("link_id").notNull().references(() => bioLink.id, { onDelete: "cascade" }),
    occurredAt: now("occurred_at"),
    /** Calendar day in the workspace timezone, like conversion_fact.day. */
    day: text("day").notNull(),
  },
  (t) => [index("bio_link_click_link_idx").on(t.linkId, t.occurredAt)],
);

export type BioPage = typeof bioPage.$inferSelect;
export type BioLink = typeof bioLink.$inferSelect;
