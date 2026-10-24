import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { channel, syncCursor } from "@/db/schema/connections";
import { enqueue } from "@/lib/jobs/boss";
import { inboxPollDue } from "./cadence";

/**
 * Enqueue an inbox poll for every channel that can receive inbox items.
 * Singleton keys mean an already-queued poll for a channel is skipped.
 */
export async function enqueueInboxSyncs(reason: "scheduled" | "manual" = "scheduled") {
  const rows = await db.select({ id: channel.id, workspaceId: channel.workspaceId, organizationId: channel.organizationId, capabilities: channel.capabilities }).from(channel).where(inArray(channel.status, ["healthy", "degraded"]));
  const cursors = await db.select({ channelId: syncCursor.channelId, freshAt: syncCursor.freshAt, lastSuccessAt: syncCursor.lastSuccessAt }).from(syncCursor).where(eq(syncCursor.resource, "inbox"));
  const byChannel = new Map(cursors.map((c) => [c.channelId, c]));
  let n = 0;
  for (const r of rows) {
    const c = r.capabilities.inbox;
    if (!c.comments && !c.mentions && !c.messages && !c.reviews) continue;
    if (reason === "scheduled" && !inboxPollDue(byChannel.get(r.id))) continue;
    await enqueue("inbox.sync", { channelId: r.id, workspaceId: r.workspaceId, organizationId: r.organizationId, reason }, { singletonKey: `inbox.sync:${r.id}`, singletonSeconds: 60 });
    n++;
  }
  return n;
}
