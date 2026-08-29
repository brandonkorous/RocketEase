/*
 * Inbox actions. Everything a rule does here is something a person could do
 * from the thread, and it is recorded the same way (conversation_event) so the
 * history stays one story.
 */
import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { workspaceMembership } from "@/db/schema/app";
import type { ActionOutcome, RuleAction } from "@/db/schema/automations";
import { contact, conversation, conversationEvent, message, type Priority } from "@/db/schema/engagement";
import { emit } from "@/lib/jobs/outbox";
import type { ApplyContext } from "./types";

const done = (kind: RuleAction["kind"], detail: string): ActionOutcome => ({ kind, status: "applied", detail });
const skip = (kind: RuleAction["kind"], detail: string): ActionOutcome => ({ kind, status: "skipped", detail });

const conversationId = (c: ApplyContext) => c.subject.ctx.conversationId;

async function isMember(workspaceId: string, userId: string) {
  const [m] = await db.select({ id: workspaceMembership.id }).from(workspaceMembership).where(and(eq(workspaceMembership.workspaceId, workspaceId), eq(workspaceMembership.userId, userId)));
  return Boolean(m);
}

async function setAssignee(c: ApplyContext, userId: string, detail: string): Promise<ActionOutcome> {
  const id = conversationId(c)!;
  await db.transaction(async (tx) => {
    await tx.update(conversation).set({ assigneeUserId: userId, updatedAt: new Date() }).where(eq(conversation.id, id));
    await tx.insert(conversationEvent).values({ workspaceId: c.subject.workspaceId, conversationId: id, kind: "assigned", data: { assigneeUserId: userId, ruleId: c.rule.id, ruleName: c.rule.name } });
  });
  return done("inbox.assign", detail);
}

/** Fewest open conversations wins; ties break on the member list order. */
async function roundRobin(c: ApplyContext, role: string): Promise<ActionOutcome> {
  const members = await db
    .select({ userId: workspaceMembership.userId })
    .from(workspaceMembership)
    .where(and(eq(workspaceMembership.workspaceId, c.subject.workspaceId), eq(workspaceMembership.role, role as never)))
    .orderBy(workspaceMembership.createdAt);
  if (members.length === 0) return skip("inbox.assign_round_robin", `no ${role.replace("_", " ")} is a member of this workspace`);
  const ids = members.map((m) => m.userId);
  const load = await db
    .select({ userId: conversation.assigneeUserId, n: sql<number>`count(*)::int` })
    .from(conversation)
    .where(and(eq(conversation.workspaceId, c.subject.workspaceId), eq(conversation.status, "open"), inArray(conversation.assigneeUserId, ids)))
    .groupBy(conversation.assigneeUserId);
  const counts = new Map(load.map((r) => [r.userId, r.n]));
  const pick = ids.reduce((best, id) => ((counts.get(id) ?? 0) < (counts.get(best) ?? 0) ? id : best), ids[0]);
  const out = await setAssignee(c, pick, `assigned to the ${role.replace("_", " ")} with the lightest queue`);
  return { ...out, kind: "inbox.assign_round_robin" };
}

async function addTag(c: ApplyContext, tag: string): Promise<ActionOutcome> {
  const contactId = c.subject.ctx.contactId;
  if (!contactId) return skip("inbox.add_tag", "no contact on this event");
  const row = await db.query.contact.findFirst({ where: (x, { eq }) => eq(x.id, contactId) });
  if (!row) return skip("inbox.add_tag", "contact not found");
  const clean = tag.trim().slice(0, 40);
  if (!clean) return skip("inbox.add_tag", "the rule has an empty tag");
  if (row.tags.includes(clean)) return done("inbox.add_tag", `contact already tagged "${clean}"`);
  await db.update(contact).set({ tags: [...row.tags, clean].slice(0, 20), updatedAt: new Date() }).where(eq(contact.id, contactId));
  return done("inbox.add_tag", `tagged the contact "${clean}"`);
}

/** Queues the reply as a `message` row; the inbox.reply worker owns delivery and reconciliation (ENG-003). */
async function sendSavedReply(c: ApplyContext, savedReplyId: string): Promise<ActionOutcome> {
  const id = conversationId(c)!;
  const conv = await db.query.conversation.findFirst({ where: (x, { eq }) => eq(x.id, id) });
  const reply = await db.query.savedReply.findFirst({ where: (r, { and, eq }) => and(eq(r.id, savedReplyId), eq(r.workspaceId, c.subject.workspaceId)) });
  if (!conv || !reply) return skip("inbox.saved_reply", "that saved reply no longer exists");
  const ch = await db.query.channel.findFirst({ where: (x, { eq }) => eq(x.id, conv.channelId) });
  if (!ch || !["healthy", "degraded"].includes(ch.status)) return skip("inbox.saved_reply", "the channel is disconnected");
  if (!ch.capabilities.inbox.reply) return skip("inbox.saved_reply", `${ch.name} does not allow replies through RocketEase`);
  const max = conv.kind === "message" ? 2000 : (ch.capabilities.limits.textMaxChars ?? 2000);
  if (reply.body.length > max) return skip("inbox.saved_reply", `the saved reply is longer than this channel's ${max} character limit`);
  const last = await db.query.message.findFirst({ where: (m, { and, eq }) => and(eq(m.conversationId, conv.id), eq(m.direction, "inbound")), orderBy: (m, { desc }) => desc(m.occurredAt) });
  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(message)
      .values({ organizationId: conv.organizationId, workspaceId: conv.workspaceId, conversationId: conv.id, channelId: ch.id, direction: "outbound", inReplyToRemoteId: last?.remoteId ?? null, authorUserId: c.creator?.userId ?? null, body: reply.body, deliveryState: "queued", idempotencyKey: randomUUID(), occurredAt: new Date() })
      .returning({ id: message.id });
    await tx.update(conversation).set({ unreadCount: 0, snoozedUntil: null, updatedAt: new Date() }).where(eq(conversation.id, conv.id));
    await emit(tx, "inbox.reply", { messageId: row.id }, { organizationId: conv.organizationId, workspaceId: conv.workspaceId, dedupeKey: `inbox.reply:${row.id}` });
  });
  return done("inbox.saved_reply", `queued the saved reply "${reply.title}"`);
}

async function snooze(c: ApplyContext, hours: number): Promise<ActionOutcome> {
  const id = conversationId(c)!;
  const until = new Date(Date.now() + Math.max(1, Math.min(720, hours)) * 3_600_000);
  await db.transaction(async (tx) => {
    await tx.update(conversation).set({ status: "snoozed", snoozedUntil: until, updatedAt: new Date() }).where(eq(conversation.id, id));
    await tx.insert(conversationEvent).values({ workspaceId: c.subject.workspaceId, conversationId: id, kind: "snoozed", data: { until: until.toISOString(), ruleId: c.rule.id, ruleName: c.rule.name } });
  });
  return done("inbox.snooze", `snoozed until ${until.toISOString()}`);
}

export async function applyInboxAction(c: ApplyContext, a: RuleAction): Promise<ActionOutcome> {
  if (!conversationId(c)) return skip(a.kind, "this trigger has no conversation");
  switch (a.kind) {
    case "inbox.assign":
      return (await isMember(c.subject.workspaceId, a.userId)) ? setAssignee(c, a.userId, "assigned as the rule specifies") : skip(a.kind, "the chosen assignee is no longer a member");
    case "inbox.assign_round_robin":
      return roundRobin(c, a.role);
    case "inbox.set_priority": {
      const id = conversationId(c)!;
      await db.transaction(async (tx) => {
        await tx.update(conversation).set({ priority: a.priority as Priority, updatedAt: new Date() }).where(eq(conversation.id, id));
        await tx.insert(conversationEvent).values({ workspaceId: c.subject.workspaceId, conversationId: id, kind: a.priority === "urgent" ? "escalated" : "priority", data: { priority: a.priority, ruleId: c.rule.id, ruleName: c.rule.name } });
      });
      return done(a.kind, `priority set to ${a.priority}`);
    }
    case "inbox.add_tag":
      return addTag(c, a.tag);
    case "inbox.saved_reply":
      return sendSavedReply(c, a.savedReplyId);
    case "inbox.snooze":
      return snooze(c, a.hours);
    default:
      return skip(a.kind, "not an inbox action");
  }
}
