"use server";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversation, conversationEvent, internalNote, message } from "@/db/schema/engagement";
import { audit } from "@/lib/audit";
import { emit } from "@/lib/jobs/outbox";
import { requireCapability } from "@/lib/session";
import { fail, guard, type ActionState } from "../content/shared";

/**
 * Queue an outbound reply. The message row is created `queued` with its own
 * idempotency key; the worker delivers it and owns delivery state (ENG-003).
 */
export async function sendReply(workspaceId: string, conversationId: string, text: string, opts: { resolve?: boolean } = {}): Promise<ActionState & { messageId?: string }> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "conversations.handle");
    const body = text.trim();
    if (!body) return fail("Write a reply first.");
    const conv = await db.query.conversation.findFirst({ where: (c, { and, eq }) => and(eq(c.id, conversationId), eq(c.workspaceId, workspaceId)) });
    if (!conv) return fail("Conversation not found.");
    const ch = await db.query.channel.findFirst({ where: (c, { eq }) => eq(c.id, conv.channelId) });
    if (!ch || !["healthy", "degraded"].includes(ch.status)) return fail("This channel is disconnected. Reconnect it before replying.");
    if (!ch.capabilities.inbox.reply) return fail(`${ch.name} does not allow replies through Make It Social.`);
    const max = conv.kind === "message" ? 2000 : (ch.capabilities.limits.textMaxChars ?? 2000);
    if (body.length > max) return fail(`Replies on this channel are limited to ${max} characters.`);
    const last = await db.query.message.findFirst({ where: (m, { and, eq }) => and(eq(m.conversationId, conv.id), eq(m.direction, "inbound")), orderBy: (m, { desc }) => desc(m.occurredAt) });

    const messageId = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(message)
        .values({ organizationId: conv.organizationId, workspaceId, conversationId: conv.id, channelId: ch.id, direction: "outbound", inReplyToRemoteId: last?.remoteId ?? null, authorUserId: ctx.session.user.id, body, deliveryState: "queued", idempotencyKey: randomUUID(), occurredAt: new Date() })
        .returning({ id: message.id });
      await tx.update(conversation).set({ assigneeUserId: conv.assigneeUserId ?? ctx.session.user.id, unreadCount: 0, status: opts.resolve ? "resolved" : "open", resolvedAt: opts.resolve ? new Date() : null, resolvedByUserId: opts.resolve ? ctx.session.user.id : null, snoozedUntil: null, updatedAt: new Date() }).where(eq(conversation.id, conv.id));
      if (opts.resolve) await tx.insert(conversationEvent).values({ workspaceId, conversationId: conv.id, kind: "resolved", actorUserId: ctx.session.user.id, data: { withReply: true } });
      await emit(tx, "inbox.reply", { messageId: row.id }, { organizationId: conv.organizationId, workspaceId, dedupeKey: `inbox.reply:${row.id}` });
      return row.id;
    });
    await audit({ action: "conversation.reply", actorUserId: ctx.session.user.id, organizationId: conv.organizationId, workspaceId, targetType: "conversation", targetId: conv.id, summary: { after: { messageId } } });
    return { ok: opts.resolve ? "Reply sent and resolved." : "Reply queued.", messageId };
  });
}

/** Retry a failed outbound message (same idempotency key → the provider dedupes). */
export async function retryReply(workspaceId: string, messageId: string): Promise<ActionState> {
  return guard(async () => {
    await requireCapability(workspaceId, "conversations.handle");
    const m = await db.query.message.findFirst({ where: (x, { and, eq }) => and(eq(x.id, messageId), eq(x.workspaceId, workspaceId)) });
    if (!m || m.direction !== "outbound" || m.deliveryState !== "failed") return fail("Nothing to retry.");
    await db.transaction(async (tx) => {
      await tx.update(message).set({ deliveryState: "queued", error: null, attempts: 0 }).where(eq(message.id, m.id));
      await emit(tx, "inbox.reply", { messageId: m.id }, { organizationId: m.organizationId, workspaceId, dedupeKey: `inbox.reply:${m.id}:${Date.now()}` });
    });
    return { ok: "Retrying." };
  });
}

export async function addInternalNote(workspaceId: string, conversationId: string, text: string): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "conversations.handle");
    const body = text.trim();
    if (!body) return fail("Write a note first.");
    const conv = await db.query.conversation.findFirst({ where: (c, { and, eq }) => and(eq(c.id, conversationId), eq(c.workspaceId, workspaceId)) });
    if (!conv) return fail("Conversation not found.");
    await db.transaction(async (tx) => {
      await tx.insert(internalNote).values({ workspaceId, conversationId: conv.id, contactId: conv.contactId, authorUserId: ctx.session.user.id, body });
      await tx.insert(conversationEvent).values({ workspaceId, conversationId: conv.id, kind: "note", actorUserId: ctx.session.user.id });
    });
    return { ok: "Note added." };
  });
}
