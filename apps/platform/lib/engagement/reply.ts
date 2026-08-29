/*
 * Outbound reply core, shared by the inbox actions and the public API.
 *
 * The API only ever writes a `draft` message: an agent can compose a reply,
 * but a person presses send. Delivery state stays the worker's business
 * (ENG-003), so nothing here talks to a provider.
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import type { Channel } from "@/db/schema/connections";
import { conversation, message, type Conversation, type DeliveryState } from "@/db/schema/engagement";
import { audit } from "@/lib/audit";

export type ReplyTarget = { conversation: Conversation; channel: Channel; max: number; inReplyToRemoteId: string | null };

/** Every check a reply must pass before a row is written, in the inbox's own words. */
export async function resolveReplyTarget(workspaceId: string, conversationId: string, body: string): Promise<{ error: string } | { target: ReplyTarget }> {
  if (!body.trim()) return { error: "Write a reply first." };
  const conv = await db.query.conversation.findFirst({ where: (c, { and, eq }) => and(eq(c.id, conversationId), eq(c.workspaceId, workspaceId)) });
  if (!conv) return { error: "Conversation not found." };
  const ch = await db.query.channel.findFirst({ where: (c, { eq }) => eq(c.id, conv.channelId) });
  if (!ch || !["healthy", "degraded"].includes(ch.status)) return { error: "This channel is disconnected. Reconnect it before replying." };
  if (!ch.capabilities.inbox.reply) return { error: `${ch.name} does not allow replies through Make It Social.` };
  const max = conv.kind === "message" ? 2000 : (ch.capabilities.limits.textMaxChars ?? 2000);
  if (body.trim().length > max) return { error: `Replies on this channel are limited to ${max} characters.` };
  const last = await db.query.message.findFirst({ where: (m, { and, eq }) => and(eq(m.conversationId, conv.id), eq(m.direction, "inbound")), orderBy: (m, { desc }) => desc(m.occurredAt) });
  return { target: { conversation: conv, channel: ch, max, inReplyToRemoteId: last?.remoteId ?? null } };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type OutboundInput = { authorUserId: string | null; body: string; deliveryState: DeliveryState; idempotencyKey?: string | null };

/** Writes the outbound row. Callers own what happens next (queue it, or leave it as a draft). */
export async function insertOutboundMessage(tx: Tx, t: ReplyTarget, input: OutboundInput) {
  const [row] = await tx
    .insert(message)
    .values({
      organizationId: t.conversation.organizationId,
      workspaceId: t.conversation.workspaceId,
      conversationId: t.conversation.id,
      channelId: t.channel.id,
      direction: "outbound",
      inReplyToRemoteId: t.inReplyToRemoteId,
      authorUserId: input.authorUserId,
      body: input.body.trim(),
      deliveryState: input.deliveryState,
      idempotencyKey: input.idempotencyKey ?? (input.deliveryState === "queued" ? randomUUID() : null),
      occurredAt: new Date(),
    })
    .returning({ id: message.id });
  return row.id;
}

export type DraftReplyResult = { error?: string; messageId?: string; existing?: boolean };

/**
 * A reply an agent proposed. It sits in the thread as a draft until a person
 * sends it — nothing is queued, no provider is called, no SLA clock is touched.
 */
export async function draftReply(
  actor: { userId: string; organizationId: string; workspaceId: string },
  conversationId: string,
  body: string,
  idempotencyKey: string | null,
  surface: string,
): Promise<DraftReplyResult> {
  if (idempotencyKey) {
    const prior = await db.query.message.findFirst({ where: (m, { eq }) => eq(m.idempotencyKey, idempotencyKey) });
    if (prior) return { messageId: prior.id, existing: true };
  }
  const resolved = await resolveReplyTarget(actor.workspaceId, conversationId, body);
  if ("error" in resolved) return { error: resolved.error };
  const messageId = await db.transaction(async (tx) => {
    const id = await insertOutboundMessage(tx, resolved.target, { authorUserId: actor.userId, body, deliveryState: "draft", idempotencyKey });
    await tx.update(conversation).set({ updatedAt: new Date() }).where(eq(conversation.id, resolved.target.conversation.id));
    return id;
  });
  await audit({ action: "conversation.reply_draft", actorUserId: actor.userId, organizationId: actor.organizationId, workspaceId: actor.workspaceId, targetType: "conversation", targetId: conversationId, summary: { after: { messageId, surface } } });
  return { messageId };
}
