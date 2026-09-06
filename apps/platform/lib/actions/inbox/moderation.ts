"use server";

import { db } from "@/db";
import { audit } from "@/lib/audit";
import { canHideAt } from "@/lib/engagement/moderation/decide";
import { clearModeration, moderateMessage } from "@/lib/engagement/moderation/write";
import { requireCapability } from "@/lib/session";
import { fail, guard, type ActionState } from "../content/shared";

/** The inbound message, in this workspace, with its thread and channel. */
async function target(workspaceId: string, messageId: string) {
  const m = await db.query.message.findFirst({ where: (x, { and, eq }) => and(eq(x.id, messageId), eq(x.workspaceId, workspaceId)) });
  if (!m || m.direction !== "inbound") return null;
  const conv = await db.query.conversation.findFirst({ where: (c, { eq }) => eq(c.id, m.conversationId) });
  const ch = conv && (await db.query.channel.findFirst({ where: (c, { eq }) => eq(c.id, conv.channelId) }));
  return conv && ch ? { m, conv, ch } : null;
}

/** Hide a comment at the network. Refused, with the reason, where the network cannot. */
export async function hideMessage(workspaceId: string, messageId: string, reason?: string): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "conversations.handle");
    const t = await target(workspaceId, messageId);
    if (!t) return fail("Message not found.");
    const d = canHideAt(t.ch, t.conv.kind);
    if (!d.ok) return fail(d.why);
    const r = await moderateMessage({ messageId, action: "hide", reason: reason?.trim() || `Hidden by ${ctx.session.user.name}`, by: { userId: ctx.session.user.id } });
    if ("error" in r) return fail(r.error);
    await audit({ action: "conversation.hide", actorUserId: ctx.session.user.id, organizationId: t.conv.organizationId, workspaceId, targetType: "message", targetId: messageId, summary: { after: { conversationId: t.conv.id, reason: r.moderation.reason } } });
    return { ok: `Asked ${t.ch.name} to hide it.` };
  });
}

/** Flag a message for the team; nothing is sent to the network. */
export async function flagMessage(workspaceId: string, messageId: string, reason?: string): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "conversations.handle");
    const t = await target(workspaceId, messageId);
    if (!t) return fail("Message not found.");
    const r = await moderateMessage({ messageId, action: "flag", reason: reason?.trim() || `Flagged by ${ctx.session.user.name}`, by: { userId: ctx.session.user.id } });
    if ("error" in r) return fail(r.error);
    await audit({ action: "conversation.flag", actorUserId: ctx.session.user.id, organizationId: t.conv.organizationId, workspaceId, targetType: "message", targetId: messageId, summary: { after: { conversationId: t.conv.id, reason: r.moderation.reason } } });
    return { ok: "Flagged for the team." };
  });
}

/** Show a hidden comment again, or clear its flag. */
export async function clearMessageModeration(workspaceId: string, messageId: string): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "conversations.handle");
    const t = await target(workspaceId, messageId);
    if (!t) return fail("Message not found.");
    const r = await clearModeration({ messageId, by: { userId: ctx.session.user.id } });
    if ("error" in r) return fail(r.error);
    const unhiding = "moderation" in r;
    await audit({ action: unhiding ? "conversation.unhide" : "conversation.unflag", actorUserId: ctx.session.user.id, organizationId: t.conv.organizationId, workspaceId, targetType: "message", targetId: messageId, summary: { after: { conversationId: t.conv.id } } });
    return { ok: unhiding ? `Asked ${t.ch.name} to show it again.` : "Cleared." };
  });
}
