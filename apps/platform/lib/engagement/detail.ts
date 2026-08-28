import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema/auth";
import { contactIdentity, conversation, conversationEvent, internalNote, message, savedReply } from "@/db/schema/engagement";
import { formatInZone } from "@/lib/time";
import { KIND_LABEL } from "./format";

export type MessageRow = { id: string; direction: "inbound" | "outbound"; body: string; attachments: { url: string; mimeType: string; name?: string; sizeBytes?: number }[]; at: string; dayKey: string; by: string | null; state: string; error: string | null; rating: number | null };
export type NoteRow = { id: string; by: string; at: string; body: string };
export type ActivityRow = { id: string; label: string; at: string; network: string };
export type ContactCard = { id: string; name: string; avatarUrl: string | null; handle: string | null; profileUrl: string | null; network: string; email: string | null; location: string | null; tags: string[]; since: string };
export type ConversationDetailData = {
  id: string; remoteThreadId: string; kind: string; kindLabel: string; status: string; priority: string; snoozedUntil: string | null; assigneeUserId: string | null; postUrl: string | null; responseDue: string | null; overdue: boolean;
  channel: { id: string; name: string; network: string; provider: string };
  contact: ContactCard; messages: MessageRow[]; notes: NoteRow[]; activity: ActivityRow[]; savedReplies: { id: string; title: string; body: string; shortcut: string | null }[];
  textMax: number;
};

const EVENT_LABEL: Record<string, string> = { opened: "Conversation opened", reopened: "Reopened", assigned: "Assigned", unassigned: "Unassigned", replied: "Replied", reply_failed: "Reply failed", resolved: "Resolved", snoozed: "Snoozed", priority: "Priority changed", note: "Note added", escalated: "Escalated" };

export async function conversationDetail(workspaceId: string, id: string, tz: string): Promise<ConversationDetailData | null> {
  const conv = await db.query.conversation.findFirst({ where: (c, { and, eq }) => and(eq(c.id, id), eq(c.workspaceId, workspaceId)) });
  if (!conv) return null;
  const [ch, contact, identity] = await Promise.all([
    db.query.channel.findFirst({ where: (c, { eq }) => eq(c.id, conv.channelId) }),
    db.query.contact.findFirst({ where: (c, { eq }) => eq(c.id, conv.contactId) }),
    db.query.contactIdentity.findFirst({ where: (i, { eq }) => eq(i.contactId, conv.contactId) }),
  ]);
  if (!ch || !contact) return null;
  const fmt = (d: Date) => formatInZone(d, tz, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  const [msgs, notes, replies, related] = await Promise.all([
    db.select({ m: message, by: user.name }).from(message).leftJoin(user, eq(user.id, message.authorUserId)).where(eq(message.conversationId, conv.id)).orderBy(message.occurredAt),
    db.select({ n: internalNote, by: user.name }).from(internalNote).innerJoin(user, eq(user.id, internalNote.authorUserId)).where(and(eq(internalNote.workspaceId, workspaceId), eq(internalNote.contactId, conv.contactId))).orderBy(desc(internalNote.createdAt)),
    db.select({ id: savedReply.id, title: savedReply.title, body: savedReply.body, shortcut: savedReply.shortcut }).from(savedReply).where(eq(savedReply.workspaceId, workspaceId)).orderBy(savedReply.title),
    db.select({ id: conversation.id }).from(conversation).where(and(eq(conversation.workspaceId, workspaceId), eq(conversation.contactId, conv.contactId))),
  ]);
  const events = related.length ? await db.select({ e: conversationEvent }).from(conversationEvent).where(inArray(conversationEvent.conversationId, related.map((r) => r.id))).orderBy(desc(conversationEvent.createdAt)).limit(6) : [];
  const now = Date.now();
  return {
    id: conv.id, remoteThreadId: conv.remoteThreadId, kind: conv.kind, kindLabel: KIND_LABEL[conv.kind] ?? conv.kind, status: conv.status, priority: conv.priority, snoozedUntil: conv.snoozedUntil ? fmt(conv.snoozedUntil) : null, assigneeUserId: conv.assigneeUserId, postUrl: conv.postUrl,
    responseDue: conv.responseDueAt && !conv.firstResponseAt ? fmt(conv.responseDueAt) : null, overdue: conv.status === "open" && !conv.firstResponseAt && !!conv.responseDueAt && conv.responseDueAt.getTime() < now,
    channel: { id: ch.id, name: ch.name, network: ch.network, provider: ch.provider },
    contact: { id: contact.id, name: contact.displayName, avatarUrl: contact.avatarUrl, handle: identity?.handle ?? null, profileUrl: identity?.profileUrl ?? null, network: identity?.network ?? ch.network, email: contact.email, location: contact.location, tags: contact.tags, since: formatInZone(contact.firstSeenAt, tz, { dateStyle: "medium" }) },
    messages: msgs.map(({ m, by }) => ({ id: m.id, direction: m.direction, body: m.body, attachments: m.attachments, at: formatInZone(m.occurredAt, tz, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }), dayKey: formatInZone(m.occurredAt, tz, { dateStyle: "medium" }), by, state: m.deliveryState, error: m.error, rating: m.rating })),
    notes: notes.map(({ n, by }) => ({ id: n.id, by, at: formatInZone(n.createdAt, tz, { dateStyle: "medium" }), body: n.body })),
    activity: events.map(({ e }) => ({ id: e.id, label: EVENT_LABEL[e.kind] ?? e.kind, at: fmt(e.createdAt), network: ch.network })),
    savedReplies: replies,
    textMax: conv.kind === "message" ? 2000 : (ch.capabilities.limits.textMaxChars ?? 2000),
  };
}
