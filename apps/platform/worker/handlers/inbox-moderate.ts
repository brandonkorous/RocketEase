import { eq } from "drizzle-orm";
import { ProviderError } from "@rocketease/providers";
import { db } from "@/db";
import { conversationEvent, message, type Message, type MessageModeration } from "@/db/schema/engagement";
import { recomputeModeratedAt } from "@/lib/engagement/moderation/write";
import type { JobPayloads } from "@/lib/jobs/queues";
import { workspacePath } from "@/lib/nav";
import { notify } from "@/lib/notifications";
import { getAdapter, loadCredential, toDescriptor } from "@/lib/providers";
import type { HandlerContext } from "./index";

const RETRYABLE = new Set(["temporary", "rate_limit"]);
const MAX_ATTEMPTS = 3;

async function record(m: Message, moderation: MessageModeration | null, event: string, data: Record<string, unknown> = {}) {
  await db.transaction(async (tx) => {
    await tx.update(message).set({ moderation }).where(eq(message.id, m.id));
    await tx.insert(conversationEvent).values({ workspaceId: m.workspaceId, conversationId: m.conversationId, kind: event, actorUserId: m.moderation?.actorUserId ?? null, data: { messageId: m.id, ...data } });
    await recomputeModeratedAt(tx, m.conversationId);
  });
}

/** Who asked: the person, else the rule's creator, else the workspace managers. */
async function requester(mod: MessageModeration): Promise<string | null> {
  if (mod.actorUserId) return mod.actorUserId;
  if (!mod.ruleId) return null;
  const rule = await db.query.automationRule.findFirst({ where: (r, { eq }) => eq(r.id, mod.ruleId!) });
  return rule?.createdByUserId ?? null;
}

async function failed(m: Message, mod: MessageModeration, note: string, hide: boolean) {
  await record(m, { ...mod, remote: "failed", note }, hide ? "hide_failed" : "unhide_failed", { note });
  await notify({ workspaceId: m.workspaceId, organizationId: m.organizationId, userId: await requester(mod), kind: "inbox.hide_failed", title: hide ? "A comment could not be hidden" : "A comment could not be shown again", body: note, href: workspacePath(m.workspaceId, `inbox/${m.conversationId}`) });
}

/**
 * Hide a comment at the network, or show it again. Every network that offers
 * it treats the call as setting a state, so a retry is safe; anything not
 * retryable is recorded as failed in the network's own words.
 */
export async function inboxModerate(data: JobPayloads["inbox.moderate"], ctx: HandlerContext) {
  const m = await db.query.message.findFirst({ where: (x, { eq }) => eq(x.id, data.messageId) });
  const mod = m?.moderation;
  if (!m || !mod || mod.remote !== "pending" || mod.action !== (data.hide ? "hide" : "unhide")) return;
  const conv = await db.query.conversation.findFirst({ where: (c, { eq }) => eq(c.id, m.conversationId) });
  const ch = conv && (await db.query.channel.findFirst({ where: (c, { eq }) => eq(c.id, conv.channelId) }));
  const conn = ch && (await db.query.providerConnection.findFirst({ where: (c, { eq }) => eq(c.id, ch.connectionId) }));
  if (!conv || !ch || !conn) return failed(m, mod, "The channel is no longer connected.", data.hide);
  const adapter = getAdapter(conn.provider);
  if (!adapter.hideItem || !m.remoteId) return failed(m, mod, "This network cannot hide comments from RocketEase.", data.hide);
  const l = ctx.log.child({ messageId: m.id, conversationId: conv.id, hide: data.hide });
  try {
    const cred = await loadCredential(conn);
    const r = await adapter.hideItem(cred, toDescriptor(ch), { kind: conv.kind, remoteId: m.remoteId, threadRemoteId: conv.remoteThreadId, postRemoteId: conv.postRemoteId ?? undefined, hide: data.hide });
    if (data.hide) await record(m, { ...mod, remote: "hidden", note: undefined, attempts: undefined }, "hidden", { remoteId: r.remoteId });
    else await record(m, null, "unhidden", { remoteId: r.remoteId });
    l.info(data.hide ? "comment hidden" : "comment shown again");
  } catch (err) {
    const attempts = (mod.attempts ?? 0) + 1;
    const retryable = !(err instanceof ProviderError) || RETRYABLE.has(err.category);
    if (retryable && attempts < MAX_ATTEMPTS) {
      await db.update(message).set({ moderation: { ...mod, attempts } }).where(eq(message.id, m.id));
      throw err;
    }
    await failed(m, mod, err instanceof Error ? err.message : String(err), data.hide);
    l.warn("moderation failed", { category: err instanceof ProviderError ? err.category : "unknown" });
  }
}
