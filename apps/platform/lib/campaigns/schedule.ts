import { and, isNull } from "drizzle-orm";
import { db } from "@/db";
import { adAccount } from "@/db/schema/campaigns";
import { enqueue } from "@/lib/jobs/boss";

/** Enqueue a paid import for every connected ad account (singleton per account). */
export async function enqueueAdsSyncs(workspaceId?: string, since?: string) {
  const rows = await db.select({ id: adAccount.id, workspaceId: adAccount.workspaceId }).from(adAccount).where(and(isNull(adAccount.disconnectedAt)));
  let n = 0;
  for (const r of rows) {
    if (workspaceId && r.workspaceId !== workspaceId) continue;
    await enqueue("ads.sync", { adAccountId: r.id, since }, { singletonKey: `ads.sync:${r.id}`, singletonSeconds: 60 });
    n++;
  }
  return n;
}
