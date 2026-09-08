/*
 * Inbox actions. Everything a rule does here is something a person could do
 * from the thread, and it is recorded the same way (conversation_event) so the
 * history stays one story.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { workspaceMembership } from "@/db/schema/app";
import type { ActionOutcome, RuleAction } from "@/db/schema/automations";
import { contact, conversation, conversationEvent, type Priority } from "@/db/schema/engagement";
import { insertOutboundMessage, resolveReplyTarget } from "@/lib/engagement/reply";
import { emit } from "@/lib/jobs/outbox";
import { applyModerationAction } from "./moderation";
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

/**
 * Queues the reply as a `message` row the rule signs (`rule_id`); the
 * inbox.reply worker owns delivery and reconciliation (ENG-003). The same
 * checks a person's reply passes apply, plus the DM rules for an automated
 * sender: inside the network's window, and one automated DM per contact per day.
 */
async function sendSavedReply(c: ApplyContext, savedReplyId: string): Promise<ActionOutcome> {
  const kind = "inbox.saved_reply";
  const reply = await db.query.savedReply.findFirst({ where: (r, { and, eq }) => and(eq(r.id, savedReplyId), eq(r.workspaceId, c.subject.workspaceId)) });
  if (!reply) return skip(kind, "that saved reply no longer exists");
  const resolved = await resolveReplyTarget(c.subject.workspaceId, conversationId(c)!, reply.body, { automated: true });
  if ("error" in resolved) return skip(kind, resolved.error);
  const t = resolved.target;
  await db.transaction(async (tx) => {
    const id = await insertOutboundMessage(tx, t, { authorUserId: c.creator?.userId ?? null, body: reply.body, deliveryState: "queued", ruleId: c.rule.id });
    await tx.update(conversation).set({ unreadCount: 0, snoozedUntil: null, updatedAt: new Date() }).where(eq(conversation.id, t.conversation.id));
    await emit(tx, "inbox.reply", { messageId: id }, { organizationId: t.conversation.organizationId, workspaceId: t.conversation.workspaceId, dedupeKey: `inbox.reply:${id}`, runAt: t.sendAfter });
  });
  return done(kind, t.sendAfter ? `queued the saved reply "${reply.title}" to go out at ${t.sendAfter.toISOString()}, when the network's limit clears` : `queued the saved reply "${reply.title}"`);
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
      return applyModerationAction(c, a);
  }
}
