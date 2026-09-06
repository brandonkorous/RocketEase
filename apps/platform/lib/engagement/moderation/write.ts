/*
 * Writing a moderation decision. The message row keeps the current state
 * (data-model.md: messages stay immutable except moderation metadata), the
 * conversation keeps the newest moderation time for the Flagged tab, and
 * every step lands in conversation_event. A hide the network can do is queued
 * as inbox.moderate; one it cannot do is recorded with the reason why and the
 * message is flagged, so nothing looks hidden that is not. Worker-safe.
 */
import { eq, sql } from "drizzle-orm";
import { db, type Db } from "@/db";
import { conversation, conversationEvent, message, type MessageModeration } from "@/db/schema/engagement";
import { emit } from "@/lib/jobs/outbox";
import { canHideAt } from "./decide";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type ModerationBy = { ruleId: string; ruleName: string } | { userId: string };
export type ModerateResult = { error: string } | { moderation: MessageModeration; conversationId: string; channelName: string };

const who = (by: ModerationBy) => ("userId" in by ? { actorUserId: by.userId } : { ruleId: by.ruleId, ruleName: by.ruleName });
const actorOf = (by: ModerationBy) => ("userId" in by ? by.userId : null);

/** The newest moderation left on the thread, or null — the Flagged tab's one definition. */
export async function recomputeModeratedAt(tx: Tx | Db, conversationId: string) {
  await tx
    .update(conversation)
    .set({ moderatedAt: sql`(select max((${message.moderation}->>'at')::timestamptz) from ${message} where ${message.conversationId} = ${conversationId} and ${message.moderation} is not null)`, updatedAt: new Date() })
    .where(eq(conversation.id, conversationId));
}

async function loadTarget(messageId: string) {
  const m = await db.query.message.findFirst({ where: (x, { eq }) => eq(x.id, messageId) });
  if (!m || m.direction !== "inbound") return null;
  const conv = await db.query.conversation.findFirst({ where: (c, { eq }) => eq(c.id, m.conversationId) });
  const ch = conv && (await db.query.channel.findFirst({ where: (c, { eq }) => eq(c.id, conv.channelId) }));
  return conv && ch ? { m, conv, ch } : null;
}

export type ModerateInput = { messageId: string; action: "hide" | "flag"; reason: string; by: ModerationBy };

/** Hide one inbound message where the network can, or flag it. */
export async function moderateMessage(input: ModerateInput): Promise<ModerateResult> {
  const t = await loadTarget(input.messageId);
  if (!t) return { error: "That message no longer exists." };
  const { m, conv, ch } = t;
  if (input.action === "hide" && m.moderation?.remote === "hidden") return { error: "It is already hidden." };
  const at = new Date();
  const base = { reason: input.reason.trim().slice(0, 200) || "No reason given", at: at.toISOString(), ...who(input.by) };
  let moderation: MessageModeration;
  let event: string;
  if (input.action === "flag") {
    moderation = { ...base, action: "flag", remote: "none" };
    event = "flagged";
  } else {
    const d = canHideAt(ch, conv.kind);
    moderation = d.ok ? { ...base, action: "hide", remote: "pending" } : { ...base, action: "hide", remote: "unsupported", note: d.why };
    event = d.ok ? "hide_requested" : "hide_unsupported";
  }
  await db.transaction(async (tx) => {
    await tx.update(message).set({ moderation }).where(eq(message.id, m.id));
    await tx.update(conversation).set({ moderatedAt: at, updatedAt: at }).where(eq(conversation.id, conv.id));
    await tx.insert(conversationEvent).values({ workspaceId: conv.workspaceId, conversationId: conv.id, kind: event, actorUserId: actorOf(input.by), data: { messageId: m.id, ...moderation } });
    if (moderation.remote === "pending") await emit(tx, "inbox.moderate", { messageId: m.id, hide: true }, { organizationId: conv.organizationId, workspaceId: conv.workspaceId, dedupeKey: `inbox.moderate:${m.id}:${moderation.at}` });
  });
  return { moderation, conversationId: conv.id, channelName: ch.name };
}

/**
 * Show a hidden comment again (through the network — the row says "pending"
 * until it answers) or clear a flag, a refused hide, or a hide still waiting.
 */
export async function clearModeration(input: { messageId: string; by: ModerationBy }): Promise<ModerateResult | { cleared: true; conversationId: string }> {
  const t = await loadTarget(input.messageId);
  const prior = t?.m.moderation;
  if (!t || !prior) return { error: "Nothing to clear on that message." };
  const { m, conv, ch } = t;
  const at = new Date();
  if (prior.remote === "hidden" || prior.action === "unhide") {
    const moderation: MessageModeration = { action: "unhide", remote: "pending", reason: prior.reason, at: at.toISOString(), ...who(input.by) };
    await db.transaction(async (tx) => {
      await tx.update(message).set({ moderation }).where(eq(message.id, m.id));
      await tx.insert(conversationEvent).values({ workspaceId: conv.workspaceId, conversationId: conv.id, kind: "unhide_requested", actorUserId: actorOf(input.by), data: { messageId: m.id } });
      await emit(tx, "inbox.moderate", { messageId: m.id, hide: false }, { organizationId: conv.organizationId, workspaceId: conv.workspaceId, dedupeKey: `inbox.moderate:${m.id}:${moderation.at}` });
    });
    return { moderation, conversationId: conv.id, channelName: ch.name };
  }
  await db.transaction(async (tx) => {
    await tx.update(message).set({ moderation: null }).where(eq(message.id, m.id));
    await tx.insert(conversationEvent).values({ workspaceId: conv.workspaceId, conversationId: conv.id, kind: prior.action === "flag" ? "flag_cleared" : "hide_cancelled", actorUserId: actorOf(input.by), data: { messageId: m.id } });
    await recomputeModeratedAt(tx, conv.id);
  });
  return { cleared: true, conversationId: conv.id };
}
