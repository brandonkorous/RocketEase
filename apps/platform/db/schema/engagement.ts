/*
 * Engagement (data-model.md "Engagement", requirements ENG-001..004).
 * Contacts are workspace-local; conversations are threads per channel;
 * messages carry provider delivery state so an ambiguous send is never
 * blindly retried (ENG-003).
 */
import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { InboxAttachment, InboxItemKind, Network } from "@make-it-social/providers";
import { organization, user } from "./auth";
import { workspace } from "./app";
import { channel, providerKey } from "./connections";

const id = (name = "id") => text(name).primaryKey().default(sql`gen_random_uuid()`);
const now = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });
const scoped = () => ({
  organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
});

export const contact = pgTable(
  "contact",
  {
    id: id(),
    ...scoped(),
    displayName: text("display_name").notNull(),
    avatarUrl: text("avatar_url"),
    email: text("email"),
    location: text("location"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    /** Set when merged into another contact; the survivor keeps provenance in `mergedFrom`. */
    mergedIntoContactId: text("merged_into_contact_id"),
    mergedFrom: jsonb("merged_from").$type<string[]>().notNull().default([]),
    firstSeenAt: now("first_seen_at"),
    createdAt: now("created_at"),
    updatedAt: now("updated_at"),
  },
  (t) => [index("contact_ws_idx").on(t.workspaceId, t.displayName)],
);

export const contactIdentity = pgTable(
  "contact_identity",
  {
    id: id(),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    contactId: text("contact_id").notNull().references(() => contact.id, { onDelete: "cascade" }),
    provider: providerKey("provider").notNull(),
    network: text("network").$type<Network>().notNull(),
    remoteId: text("remote_id").notNull(),
    handle: text("handle"),
    profileUrl: text("profile_url"),
    avatarUrl: text("avatar_url"),
    createdAt: now("created_at"),
  },
  (t) => [uniqueIndex("contact_identity_ws_net_remote_idx").on(t.workspaceId, t.network, t.remoteId), index("contact_identity_contact_idx").on(t.contactId)],
);

export const CONVERSATION_KINDS = ["comment", "mention", "message", "review"] as const satisfies readonly InboxItemKind[];
export const conversationKind = pgEnum("conversation_kind", CONVERSATION_KINDS);
export const CONVERSATION_STATUSES = ["open", "snoozed", "resolved"] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];
export const conversationStatus = pgEnum("conversation_status", CONVERSATION_STATUSES);
export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const priority = pgEnum("conversation_priority", PRIORITIES);

export const conversation = pgTable(
  "conversation",
  {
    id: id(),
    ...scoped(),
    channelId: text("channel_id").notNull().references(() => channel.id, { onDelete: "cascade" }),
    contactId: text("contact_id").notNull().references(() => contact.id, { onDelete: "cascade" }),
    kind: conversationKind("kind").notNull(),
    remoteThreadId: text("remote_thread_id").notNull(),
    postRemoteId: text("post_remote_id"),
    postUrl: text("post_url"),
    status: conversationStatus("status").notNull().default("open"),
    priority: priority("priority").notNull().default("normal"),
    assigneeUserId: text("assignee_user_id").references(() => user.id, { onDelete: "set null" }),
    preview: text("preview").notNull().default(""),
    unreadCount: integer("unread_count").notNull().default(0),
    messageCount: integer("message_count").notNull().default(0),
    lastMessageAt: ts("last_message_at").notNull(),
    lastInboundAt: ts("last_inbound_at"),
    lastOutboundAt: ts("last_outbound_at"),
    /** SLA timestamps (pages.md): first reply, response target, resolution. */
    firstResponseAt: ts("first_response_at"),
    responseDueAt: ts("response_due_at"),
    snoozedUntil: ts("snoozed_until"),
    resolvedAt: ts("resolved_at"),
    resolvedByUserId: text("resolved_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: now("created_at"),
    updatedAt: now("updated_at"),
  },
  (t) => [
    uniqueIndex("conversation_channel_thread_idx").on(t.channelId, t.remoteThreadId),
    index("conversation_ws_status_idx").on(t.workspaceId, t.status, t.lastMessageAt),
    index("conversation_ws_assignee_idx").on(t.workspaceId, t.assigneeUserId),
    index("conversation_contact_idx").on(t.contactId),
  ],
);

export const DELIVERY_STATES = ["received", "queued", "sending", "sent", "ambiguous", "failed"] as const;
export type DeliveryState = (typeof DELIVERY_STATES)[number];
export const deliveryState = pgEnum("message_delivery_state", DELIVERY_STATES);

export const message = pgTable(
  "message",
  {
    id: id(),
    ...scoped(),
    conversationId: text("conversation_id").notNull().references(() => conversation.id, { onDelete: "cascade" }),
    channelId: text("channel_id").notNull().references(() => channel.id, { onDelete: "cascade" }),
    direction: text("direction").$type<"inbound" | "outbound">().notNull(),
    /** Null until the provider acknowledges an outbound send. */
    remoteId: text("remote_id"),
    inReplyToRemoteId: text("in_reply_to_remote_id"),
    authorContactId: text("author_contact_id").references(() => contact.id, { onDelete: "set null" }),
    authorUserId: text("author_user_id").references(() => user.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    attachments: jsonb("attachments").$type<InboxAttachment[]>().notNull().default([]),
    rating: integer("rating"),
    deliveryState: deliveryState("delivery_state").notNull().default("received"),
    idempotencyKey: text("idempotency_key"),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    occurredAt: ts("occurred_at").notNull(),
    createdAt: now("created_at"),
  },
  (t) => [
    uniqueIndex("message_channel_remote_idx").on(t.channelId, t.remoteId),
    uniqueIndex("message_idempotency_idx").on(t.idempotencyKey),
    index("message_conversation_idx").on(t.conversationId, t.occurredAt),
  ],
);

export const internalNote = pgTable(
  "internal_note",
  {
    id: id(),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id").references(() => conversation.id, { onDelete: "cascade" }),
    contactId: text("contact_id").references(() => contact.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: now("created_at"),
  },
  (t) => [index("internal_note_conversation_idx").on(t.conversationId), index("internal_note_contact_idx").on(t.contactId)],
);

export const savedReply = pgTable(
  "saved_reply",
  {
    id: id(),
    ...scoped(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    shortcut: text("shortcut"),
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: now("created_at"),
    updatedAt: now("updated_at"),
  },
  (t) => [index("saved_reply_ws_idx").on(t.workspaceId, t.title)],
);

/** Append-only history: assigned, status, priority, replied, note, snoozed, escalated. */
export const conversationEvent = pgTable(
  "conversation_event",
  {
    id: id(),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id").notNull().references(() => conversation.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: now("created_at"),
  },
  (t) => [index("conversation_event_conversation_idx").on(t.conversationId, t.createdAt)],
);

/** Per-workspace inbox settings (response targets, ENG-004). */
export const inboxSettings = pgTable("inbox_settings", {
  workspaceId: text("workspace_id").primaryKey().references(() => workspace.id, { onDelete: "cascade" }),
  firstResponseTargetMinutes: integer("first_response_target_minutes").notNull().default(60),
  updatedAt: now("updated_at"),
});

export type Contact = typeof contact.$inferSelect;
export type Conversation = typeof conversation.$inferSelect;
export type Message = typeof message.$inferSelect;
export type SavedReply = typeof savedReply.$inferSelect;
