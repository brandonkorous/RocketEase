"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversation, conversationEvent, PRIORITIES, type Priority } from "@/db/schema/engagement";
import { audit } from "@/lib/audit";
import { track } from "@/lib/telemetry";
import { notify } from "@/lib/notifications";
import { workspacePath } from "@/lib/nav";
import { requireCapability, requireWorkspace } from "@/lib/session";
import { zonedToUtc } from "@/lib/time";
import { fail, guard, type ActionState } from "../content/shared";

async function loadConversation(workspaceId: string, id: string) {
  return db.query.conversation.findFirst({ where: (c, { and, eq }) => and(eq(c.id, id), eq(c.workspaceId, workspaceId)) });
}

export async function assignConversation(workspaceId: string, conversationId: string, assigneeUserId: string | null): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "conversations.handle");
    const conv = await loadConversation(workspaceId, conversationId);
    if (!conv) return fail("Conversation not found.");
    await db.transaction(async (tx) => {
      await tx.update(conversation).set({ assigneeUserId, updatedAt: new Date() }).where(eq(conversation.id, conv.id));
      await tx.insert(conversationEvent).values({ workspaceId, conversationId: conv.id, kind: assigneeUserId ? "assigned" : "unassigned", actorUserId: ctx.session.user.id, data: { assigneeUserId } });
    });
    if (assigneeUserId && assigneeUserId !== ctx.session.user.id) {
      await notify({ workspaceId, organizationId: conv.organizationId, userId: assigneeUserId, kind: "inbox.assigned", title: `${ctx.session.user.name} assigned you a conversation`, body: conv.preview, href: workspacePath(workspaceId, `inbox/${conv.id}`) });
    }
    await audit({ action: "conversation.assign", actorUserId: ctx.session.user.id, organizationId: conv.organizationId, workspaceId, targetType: "conversation", targetId: conv.id, summary: { after: { assigneeUserId } } });
    return { ok: assigneeUserId ? "Assigned." : "Unassigned." };
  });
}

export async function setConversationStatus(workspaceId: string, conversationId: string, status: "open" | "resolved" | "snoozed", snoozeUntilLocal?: string): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "conversations.handle");
    const conv = await loadConversation(workspaceId, conversationId);
    if (!conv) return fail("Conversation not found.");
    const until = status === "snoozed" ? (snoozeUntilLocal ? zonedToUtc(snoozeUntilLocal, ctx.workspace.timezone) : new Date(Date.now() + 86_400_000)) : null;
    if (status === "snoozed" && until && until.getTime() <= Date.now()) return fail("Snooze time must be in the future.");
    await db.transaction(async (tx) => {
      await tx.update(conversation).set({ status, snoozedUntil: until, resolvedAt: status === "resolved" ? new Date() : null, resolvedByUserId: status === "resolved" ? ctx.session.user.id : null, unreadCount: status === "resolved" ? 0 : conv.unreadCount, updatedAt: new Date() }).where(eq(conversation.id, conv.id));
      await tx.insert(conversationEvent).values({ workspaceId, conversationId: conv.id, kind: status === "open" ? "reopened" : status, actorUserId: ctx.session.user.id, data: until ? { until: until.toISOString() } : {} });
    });
    await audit({ action: `conversation.${status}`, actorUserId: ctx.session.user.id, organizationId: conv.organizationId, workspaceId, targetType: "conversation", targetId: conv.id });
    if (status === "resolved") await track("conversation_resolved", { userId: ctx.session.user.id, organizationId: conv.organizationId, workspaceId, surface: "action:setConversationStatus" });
    return { ok: status === "resolved" ? "Resolved." : status === "snoozed" ? "Snoozed." : "Reopened." };
  });
}

export async function setConversationPriority(workspaceId: string, conversationId: string, priority: string): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "conversations.handle");
    if (!PRIORITIES.includes(priority as Priority)) return fail("Unknown priority.");
    const conv = await loadConversation(workspaceId, conversationId);
    if (!conv) return fail("Conversation not found.");
    await db.transaction(async (tx) => {
      await tx.update(conversation).set({ priority: priority as Priority, updatedAt: new Date() }).where(eq(conversation.id, conv.id));
      await tx.insert(conversationEvent).values({ workspaceId, conversationId: conv.id, kind: priority === "urgent" ? "escalated" : "priority", actorUserId: ctx.session.user.id, data: { priority } });
    });
    return { ok: `Priority set to ${priority}.` };
  });
}

/** Opening a thread clears its unread badge; viewers may read, so this only needs membership. */
export async function markConversationRead(workspaceId: string, conversationId: string): Promise<ActionState> {
  await requireWorkspace(workspaceId);
  await db.update(conversation).set({ unreadCount: 0 }).where(and(eq(conversation.id, conversationId), eq(conversation.workspaceId, workspaceId)));
  return {};
}
