/*
 * Moderation actions (M14.6). A hide goes to the network where it can
 * (HIDE_SUPPORT); where it cannot, the message is flagged with the reason
 * why, so nothing looks hidden that is not. A draft is a saved reply written
 * into the thread as a draft — a person presses Send.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import type { ActionOutcome, RuleAction } from "@/db/schema/automations";
import { conversation, message } from "@/db/schema/engagement";
import { moderateMessage } from "@/lib/engagement/moderation/write";
import type { ApplyContext } from "./types";

const done = (kind: RuleAction["kind"], detail: string): ActionOutcome => ({ kind, status: "applied", detail });
const skip = (kind: RuleAction["kind"], detail: string): ActionOutcome => ({ kind, status: "skipped", detail });

async function moderate(c: ApplyContext, action: "hide" | "flag", reason: string | undefined): Promise<ActionOutcome> {
  const kind = action === "hide" ? "inbox.hide" : "inbox.flag";
  const messageId = c.subject.ctx.messageId;
  if (!messageId) return skip(kind, "this event has no message");
  const r = await moderateMessage({ messageId, action, reason: reason?.trim() || `Rule “${c.rule.name}”`, by: { ruleId: c.rule.id, ruleName: c.rule.name } });
  if ("error" in r) return skip(kind, r.error);
  const m = r.moderation;
  if (m.remote === "pending") return done(kind, `asked ${r.channelName} to hide the comment`);
  if (m.remote === "unsupported") return done(kind, `could not hide it on ${r.channelName} (${m.note}); flagged it for a person instead`);
  return done(kind, "flagged the message for a person");
}

/** A draft row in the thread; nothing is queued, no provider is called, no SLA clock moves. */
async function draftReply(c: ApplyContext, savedReplyId: string): Promise<ActionOutcome> {
  const kind = "inbox.draft_reply";
  const id = c.subject.ctx.conversationId!;
  const conv = await db.query.conversation.findFirst({ where: (x, { eq }) => eq(x.id, id) });
  const reply = await db.query.savedReply.findFirst({ where: (r, { and, eq }) => and(eq(r.id, savedReplyId), eq(r.workspaceId, c.subject.workspaceId)) });
  if (!conv || !reply) return skip(kind, "that saved reply no longer exists");
  const ch = await db.query.channel.findFirst({ where: (x, { eq }) => eq(x.id, conv.channelId) });
  if (!ch) return skip(kind, "the channel is gone");
  if (!ch.capabilities.inbox.reply) return skip(kind, `${ch.name} does not allow replies through RocketEase`);
  const max = conv.kind === "message" ? 2000 : (ch.capabilities.limits.textMaxChars ?? 2000);
  if (reply.body.length > max) return skip(kind, `the saved reply is longer than this channel's ${max} character limit`);
  const existing = await db.query.message.findFirst({ where: (m, { and, eq }) => and(eq(m.conversationId, conv.id), eq(m.direction, "outbound"), eq(m.deliveryState, "draft"), eq(m.body, reply.body)) });
  if (existing) return done(kind, `the draft “${reply.title}” is already in the thread`);
  const last = await db.query.message.findFirst({ where: (m, { and, eq }) => and(eq(m.conversationId, conv.id), eq(m.direction, "inbound")), orderBy: (m, { desc }) => desc(m.occurredAt) });
  await db.transaction(async (tx) => {
    await tx.insert(message).values({ organizationId: conv.organizationId, workspaceId: conv.workspaceId, conversationId: conv.id, channelId: ch.id, direction: "outbound", inReplyToRemoteId: last?.remoteId ?? null, authorUserId: c.creator?.userId ?? null, body: reply.body, deliveryState: "draft", occurredAt: new Date() });
    await tx.update(conversation).set({ updatedAt: new Date() }).where(eq(conversation.id, conv.id));
  });
  return done(kind, `drafted the saved reply “${reply.title}” for a person to send`);
}

export async function applyModerationAction(c: ApplyContext, a: RuleAction): Promise<ActionOutcome> {
  switch (a.kind) {
    case "inbox.hide":
      return moderate(c, "hide", a.reason);
    case "inbox.flag":
      return moderate(c, "flag", a.reason);
    case "inbox.draft_reply":
      return draftReply(c, a.savedReplyId);
    default:
      return skip(a.kind, "not a moderation action");
  }
}
