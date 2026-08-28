import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { channel } from "@/db/schema/connections";
import { enqueue } from "@/lib/jobs/boss";

/** Enqueue an insights pull for every insight-capable channel (singleton per channel). */
export async function enqueueInsightsIngests(workspaceId?: string, since?: string) {
  const rows = await db.select({ id: channel.id, workspaceId: channel.workspaceId, capabilities: channel.capabilities }).from(channel).where(inArray(channel.status, ["healthy", "degraded"]));
  let n = 0;
  for (const r of rows) {
    if (workspaceId && r.workspaceId !== workspaceId) continue;
    if (!r.capabilities.insights.organic) continue;
    await enqueue("insights.ingest", { channelId: r.id, since }, { singletonKey: `insights.ingest:${r.id}`, singletonSeconds: 60 });
    n++;
  }
  return n;
}
