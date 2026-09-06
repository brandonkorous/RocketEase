/*
 * The inbox subject: one inbound message, with what a moderation rule needs
 * to know about it — its links, its language and this contact's history —
 * each with the one definition fields.ts shows in the builder. Worker-safe.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { workspace } from "@/db/schema/app";
import { message } from "@/db/schema/engagement";
import { detectLanguage, hasLink, linkHosts } from "@/lib/engagement/signals";
import type { Facts } from "./evaluate";
import type { Subject } from "./facts";
import { inBusinessHours } from "./hours";

const timezoneOf = async (workspaceId: string) => (await db.select({ tz: workspace.timezone }).from(workspace).where(eq(workspace.id, workspaceId)))[0]?.tz ?? "UTC";

/**
 * prior_messages: inbound messages this contact sent this workspace before this one.
 * prior_moderations: this contact's OTHER inbound messages that are hidden or flagged
 * right now — a flag a person cleared, or a comment shown again, was their decision
 * and no longer counts.
 */
async function contactHistory(workspaceId: string, contactId: string, m: { id: string; occurredAt: Date }) {
  const [row] = await db
    .select({
      messages: sql<number>`count(*) filter (where ${message.occurredAt} < ${m.occurredAt.toISOString()}::timestamptz)::int`,
      moderations: sql<number>`count(*) filter (where ${message.moderation} is not null and ${message.id} <> ${m.id})::int`,
    })
    .from(message)
    .where(and(eq(message.workspaceId, workspaceId), eq(message.authorContactId, contactId), eq(message.direction, "inbound")));
  return { messages: row?.messages ?? 0, moderations: row?.moderations ?? 0 };
}

export async function inboxSubject(messageId: string): Promise<Subject[]> {
  const m = await db.query.message.findFirst({ where: (x, { eq }) => eq(x.id, messageId) });
  if (!m || m.direction !== "inbound") return [];
  const conv = await db.query.conversation.findFirst({ where: (c, { eq }) => eq(c.id, m.conversationId) });
  if (!conv) return [];
  const [ch, contact, tz, history] = await Promise.all([
    db.query.channel.findFirst({ where: (c, { eq }) => eq(c.id, m.channelId) }),
    db.query.contact.findFirst({ where: (c, { eq }) => eq(c.id, conv.contactId) }),
    timezoneOf(conv.workspaceId),
    contactHistory(conv.workspaceId, conv.contactId, m),
  ]);
  const facts: Facts = {
    network: ch?.network ?? "",
    channel: ch?.name ?? "",
    kind: conv.kind,
    text: m.body,
    contact_tags: contact?.tags ?? [],
    priority: conv.priority,
    business_hours: inBusinessHours(m.occurredAt, tz),
    first_message: conv.messageCount <= 1,
    rating: m.rating,
    has_link: hasLink(m.body),
    link_hosts: linkHosts(m.body),
    language: detectLanguage(m.body),
    prior_messages: history.messages,
    prior_moderations: history.moderations,
  };
  const label = `${contact?.displayName ?? "Someone"} on ${ch?.name ?? "a channel"}`;
  const ctx = { conversationId: conv.id, contactId: conv.contactId, messageId: m.id, conversationKind: conv.kind, channelId: m.channelId };
  return [{ refId: m.id, workspaceId: conv.workspaceId, organizationId: conv.organizationId, label, href: `/app/${conv.workspaceId}/inbox/${conv.id}`, facts, ctx }];
}
