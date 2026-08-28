import { eq, sql } from "drizzle-orm";
import { ProviderError, type ReplyResult } from "@make-it-social/providers";
import { db } from "@/db";
import { conversation, conversationEvent, message, type Message } from "@/db/schema/engagement";
import type { JobPayloads } from "@/lib/jobs/queues";
import { notify } from "@/lib/notifications";
import { getAdapter, loadCredential, toDescriptor } from "@/lib/providers";
import { workspacePath } from "@/lib/nav";
import type { HandlerContext } from "./index";

const RETRYABLE = new Set(["temporary", "rate_limit"]);

async function markSent(m: Message, r: ReplyResult) {
  await db.transaction(async (tx) => {
    await tx.update(message).set({ deliveryState: "sent", remoteId: r.remoteId, occurredAt: new Date(r.sentAt), error: null }).where(eq(message.id, m.id));
    await tx.update(conversation).set({ lastOutboundAt: new Date(r.sentAt), firstResponseAt: sql`coalesce(${conversation.firstResponseAt}, ${new Date(r.sentAt).toISOString()}::timestamptz)`, lastMessageAt: new Date(r.sentAt), preview: m.body.slice(0, 200), updatedAt: new Date() }).where(eq(conversation.id, m.conversationId));
    await tx.insert(conversationEvent).values({ workspaceId: m.workspaceId, conversationId: m.conversationId, kind: "replied", actorUserId: m.authorUserId, data: { messageId: m.id, remoteId: r.remoteId } });
  });
}

async function markFailed(m: Message, reason: string) {
  await db.transaction(async (tx) => {
    await tx.update(message).set({ deliveryState: "failed", error: reason }).where(eq(message.id, m.id));
    await tx.insert(conversationEvent).values({ workspaceId: m.workspaceId, conversationId: m.conversationId, kind: "reply_failed", actorUserId: m.authorUserId, data: { messageId: m.id, reason } });
  });
  await notify({ workspaceId: m.workspaceId, organizationId: m.organizationId, userId: m.authorUserId, kind: "inbox.reply_failed", title: "A reply could not be sent", body: reason, href: workspacePath(m.workspaceId, `inbox/${m.conversationId}`) });
}

/**
 * ENG-003: an ambiguous provider outcome is reconciled (findReply by
 * idempotency key) before anything is sent again. Non-retryable categories
 * fail fast and notify the author.
 */
export async function inboxReply(data: JobPayloads["inbox.reply"], ctx: HandlerContext) {
  const m = await db.query.message.findFirst({ where: (x, { eq }) => eq(x.id, data.messageId) });
  if (!m || m.direction !== "outbound" || m.deliveryState === "sent" || m.deliveryState === "failed") return;
  const conv = await db.query.conversation.findFirst({ where: (c, { eq }) => eq(c.id, m.conversationId) });
  const ch = conv && (await db.query.channel.findFirst({ where: (c, { eq }) => eq(c.id, conv.channelId) }));
  const conn = ch && (await db.query.providerConnection.findFirst({ where: (c, { eq }) => eq(c.id, ch.connectionId) }));
  if (!conv || !ch || !conn) return markFailed(m, "The channel is no longer connected.");
  const adapter = getAdapter(conn.provider);
  if (!adapter.reply) return markFailed(m, "This network does not support replies from Make It Social.");
  const l = ctx.log.child({ messageId: m.id, conversationId: conv.id });
  const cred = await loadCredential(conn);
  const desc = toDescriptor(ch);
  const key = m.idempotencyKey ?? m.id;
  // Anything created before the row existed cannot be this reply (ENG-003 structural reconciliation).
  const sentAfter = new Date(m.createdAt.getTime() - 60_000).toISOString();
  const lookup = () => ({ kind: conv.kind, threadRemoteId: conv.remoteThreadId, inReplyToRemoteId: m.inReplyToRemoteId ?? undefined, postRemoteId: conv.postRemoteId ?? undefined, text: m.body, idempotencyKey: key, sentAfter });

  if (m.deliveryState === "ambiguous") {
    const found = await adapter.findReply?.(cred, desc, lookup());
    if (found) { l.info("ambiguous reply reconciled as sent"); return markSent(m, found); }
    l.info("ambiguous reply not found remotely; sending again");
  }

  const identity = await db.query.contactIdentity.findFirst({ where: (i, { and, eq }) => and(eq(i.contactId, conv.contactId), eq(i.network, ch.network)) });
  const request = { kind: conv.kind, threadRemoteId: conv.remoteThreadId, inReplyToRemoteId: m.inReplyToRemoteId ?? undefined, recipientRemoteId: identity?.remoteId, postRemoteId: conv.postRemoteId ?? undefined, text: m.body, idempotencyKey: key };
  await db.update(message).set({ deliveryState: "sending", attempts: sql`${message.attempts} + 1` }).where(eq(message.id, m.id));
  try {
    const r = await adapter.reply(cred, desc, request);
    await markSent(m, r);
    l.info("reply sent", { remoteId: r.remoteId });
  } catch (err) {
    if (!(err instanceof ProviderError)) { await db.update(message).set({ deliveryState: "queued", error: String(err) }).where(eq(message.id, m.id)); throw err; }
    if (err.ambiguous) {
      await db.update(message).set({ deliveryState: "ambiguous", error: err.message }).where(eq(message.id, m.id));
      const found = await adapter.findReply?.(cred, desc, { ...request, sentAfter });
      if (found) { l.info("reply reconciled after ambiguous error"); return markSent(m, found); }
      throw err; // retry → reconcile first
    }
    if (RETRYABLE.has(err.category) && m.attempts < 3) { await db.update(message).set({ deliveryState: "queued", error: err.message }).where(eq(message.id, m.id)); throw err; }
    await markFailed(m, err.message);
    l.warn("reply failed", { category: err.category });
  }
}
