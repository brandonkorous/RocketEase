/*
 * Normalised inbox items → contacts, conversations, messages. Idempotent on
 * (channel, remoteId); safe to run from polling and webhooks concurrently.
 */
import { and, eq, sql } from "drizzle-orm";
import type { InboxItem } from "@rocketease/providers";
import { db, type Db } from "@/db";
import type { Channel } from "@/db/schema/connections";
import { contact, contactIdentity, conversation, conversationEvent, inboxSettings, message } from "@/db/schema/engagement";
import { emit } from "@/lib/jobs/outbox";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

async function upsertContact(tx: Tx, ch: Channel, item: InboxItem) {
  const a = item.author;
  const existing = await tx.query.contactIdentity.findFirst({ where: (i, { and, eq }) => and(eq(i.workspaceId, ch.workspaceId), eq(i.network, ch.network), eq(i.remoteId, a.remoteId)) });
  if (existing) {
    const c = await tx.query.contact.findFirst({ where: (c, { eq }) => eq(c.id, existing.contactId) });
    return c?.mergedIntoContactId ?? existing.contactId;
  }
  const [c] = await tx.insert(contact).values({ organizationId: ch.organizationId, workspaceId: ch.workspaceId, displayName: a.name, avatarUrl: a.avatarUrl ?? null }).returning({ id: contact.id });
  await tx.insert(contactIdentity).values({ workspaceId: ch.workspaceId, contactId: c.id, provider: ch.provider, network: ch.network, remoteId: a.remoteId, handle: a.handle ?? null, profileUrl: a.profileUrl ?? null, avatarUrl: a.avatarUrl ?? null });
  return c.id;
}

async function upsertConversation(tx: Tx, ch: Channel, item: InboxItem, contactId: string) {
  const existing = await tx.query.conversation.findFirst({ where: (c, { and, eq }) => and(eq(c.channelId, ch.id), eq(c.remoteThreadId, item.threadRemoteId)) });
  if (existing) return existing;
  const settings = await tx.query.inboxSettings.findFirst({ where: (s, { eq }) => eq(s.workspaceId, ch.workspaceId) });
  const at = new Date(item.occurredAt);
  const due = item.direction === "inbound" ? new Date(at.getTime() + (settings?.firstResponseTargetMinutes ?? 60) * 60_000) : null;
  const [row] = await tx
    .insert(conversation)
    .values({ organizationId: ch.organizationId, workspaceId: ch.workspaceId, channelId: ch.id, contactId, kind: item.kind, remoteThreadId: item.threadRemoteId, postRemoteId: item.postRemoteId ?? null, postUrl: item.postUrl ?? null, preview: item.text.slice(0, 200), lastMessageAt: at, responseDueAt: due })
    .onConflictDoNothing()
    .returning();
  if (row) {
    await tx.insert(conversationEvent).values({ workspaceId: ch.workspaceId, conversationId: row.id, kind: "opened", data: { kind: item.kind } });
    return row;
  }
  return (await tx.query.conversation.findFirst({ where: (c, { and, eq }) => and(eq(c.channelId, ch.id), eq(c.remoteThreadId, item.threadRemoteId)) }))!;
}

/** Insert one item; returns true when it was new. */
async function ingestOne(tx: Tx, ch: Channel, item: InboxItem): Promise<boolean> {
  const inbound = item.direction === "inbound";
  const contactId = await upsertContact(tx, ch, item);
  const conv = await upsertConversation(tx, ch, item, contactId);
  const [inserted] = await tx
    .insert(message)
    .values({ organizationId: ch.organizationId, workspaceId: ch.workspaceId, conversationId: conv.id, channelId: ch.id, direction: item.direction, remoteId: item.remoteId, inReplyToRemoteId: item.inReplyToRemoteId ?? null, authorContactId: inbound ? contactId : null, body: item.text, attachments: item.attachments ?? [], rating: item.rating ?? null, deliveryState: inbound ? "received" : "sent", occurredAt: new Date(item.occurredAt) })
    .onConflictDoNothing()
    .returning({ id: message.id });
  if (!inserted) return false;
  const at = new Date(item.occurredAt);
  const newer = at > conv.lastMessageAt;
  const reopen = inbound && conv.status !== "open" && at > conv.lastMessageAt;
  await tx
    .update(conversation)
    .set({
      preview: newer ? item.text.slice(0, 200) : conv.preview,
      lastMessageAt: newer ? at : conv.lastMessageAt,
      lastInboundAt: inbound ? at : conv.lastInboundAt,
      lastOutboundAt: !inbound ? at : conv.lastOutboundAt,
      unreadCount: inbound ? sql`${conversation.unreadCount} + 1` : conversation.unreadCount,
      messageCount: sql`${conversation.messageCount} + 1`,
      status: reopen ? "open" : conv.status,
      snoozedUntil: reopen ? null : conv.snoozedUntil,
      updatedAt: new Date(),
    })
    .where(eq(conversation.id, conv.id));
  if (reopen) await tx.insert(conversationEvent).values({ workspaceId: ch.workspaceId, conversationId: conv.id, kind: "reopened", data: { reason: "new_inbound" } });
  // Automation rules classify the item (flows.md "Unified inbox" step 2); evaluated out of band, never inline.
  if (inbound) await emit(tx, "automation.evaluate", { trigger: "inbox.message_received", refId: inserted.id }, { organizationId: ch.organizationId, workspaceId: ch.workspaceId, dedupeKey: `automation:inbox:${inserted.id}` });
  return true;
}

export async function ingestItems(ch: Channel, items: InboxItem[]) {
  let created = 0;
  for (const item of items) {
    const ok = await db.transaction((tx) => ingestOne(tx, ch, item));
    if (ok) created++;
  }
  return created;
}

/** Wake snoozed conversations whose time has passed. Cheap; run on every sync. */
export async function wakeSnoozed(workspaceId: string) {
  await db.update(conversation).set({ status: "open", snoozedUntil: null, updatedAt: new Date() }).where(and(eq(conversation.workspaceId, workspaceId), eq(conversation.status, "snoozed"), sql`${conversation.snoozedUntil} <= now()`));
}
