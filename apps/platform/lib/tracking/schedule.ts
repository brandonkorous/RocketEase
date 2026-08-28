import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { trackingSource } from "@/db/schema/tracking";
import { enqueue } from "@/lib/jobs/boss";

/**
 * Enqueue a pull for every connected tracking source (singleton per source).
 * Sources needing attention are included: the sync is how they recover once the
 * user has fixed the permission on the other side.
 */
export async function enqueueTrackingSyncs(workspaceId?: string, since?: string) {
  const rows = await db
    .select({ id: trackingSource.id, workspaceId: trackingSource.workspaceId })
    .from(trackingSource)
    .where(and(isNull(trackingSource.disconnectedAt), workspaceId ? eq(trackingSource.workspaceId, workspaceId) : undefined));
  let n = 0;
  for (const r of rows) {
    await enqueue("tracking.sync", { sourceId: r.id, since }, { singletonKey: `tracking.sync:${r.id}`, singletonSeconds: 60 });
    n++;
  }
  return n;
}
