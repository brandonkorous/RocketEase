import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { channel } from "@/db/schema/connections";
import { enqueue } from "@/lib/jobs/boss";

/**
 * Enqueue an inbox poll for every channel that can receive inbox items.
 * Singleton keys mean an already-queued poll for a channel is skipped.
 */
export async function enqueueInboxSyncs(reason: "scheduled" | "manual" = "scheduled") {
  const rows = await db.select({ id: channel.id, capabilities: channel.capabilities }).from(channel).where(inArray(channel.status, ["healthy", "degraded"]));
  let n = 0;
  for (const r of rows) {
    const c = r.capabilities.inbox;
    if (!c.comments && !c.mentions && !c.messages && !c.reviews) continue;
    await enqueue("inbox.sync", { channelId: r.id, reason }, { singletonKey: `inbox.sync:${r.id}`, singletonSeconds: 60 });
    n++;
  }
  return n;
}
