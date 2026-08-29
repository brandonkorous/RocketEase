import { and, eq, inArray, isNotNull, lt } from "drizzle-orm";
import { ProviderError } from "@rocketease/providers";
import { db } from "@/db";
import { channel, providerConnection } from "@/db/schema/connections";
import type { JobPayloads } from "@/lib/jobs/queues";
import { getAdapter, openCredential, sealCredential } from "@/lib/providers";
import type { HandlerContext } from "./index";

const WINDOW_DAYS = 7;

/**
 * Token-refresh sweep: refresh provider credentials expiring within 7 days so
 * scheduled publishes never hit an expired token. Permission errors move the
 * connection to `expired` and its channels to `action_required` (integrations.md).
 */
export async function connectionRefresh(data: JobPayloads["connection.refresh"], ctx: HandlerContext) {
  const horizon = new Date(Date.now() + (data.withinDays ?? WINDOW_DAYS) * 86_400_000);
  const conns = await db
    .select()
    .from(providerConnection)
    .where(and(inArray(providerConnection.status, ["active", "expired"]), isNotNull(providerConnection.expiresAt), lt(providerConnection.expiresAt, horizon), ...(data.connectionId ? [eq(providerConnection.id, data.connectionId)] : [])));
  let refreshed = 0;
  for (const conn of conns) {
    if (ctx.signal.aborted) break;
    if (await refreshOne(conn, ctx)) refreshed++;
  }
  ctx.log.info("connection refresh sweep", { candidates: conns.length, refreshed });
}

async function refreshOne(conn: typeof providerConnection.$inferSelect, ctx: HandlerContext): Promise<boolean> {
  const l = ctx.log.child({ connectionId: conn.id, provider: conn.provider, workspaceId: conn.workspaceId });
  try {
    const cred = await getAdapter(conn.provider).refresh(openCredential(conn));
    await db
      .update(providerConnection)
      .set({ secret: sealCredential(conn.id, cred), expiresAt: cred.expiresAt ? new Date(cred.expiresAt) : null, lastRefreshedAt: new Date(), status: "active", lastError: null, updatedAt: new Date() })
      .where(eq(providerConnection.id, conn.id));
    l.info("credential refreshed", { expiresAt: cred.expiresAt ?? null });
    return true;
  } catch (err) {
    const pe = err instanceof ProviderError ? err : null;
    const permission = pe?.category === "permission" || pe?.category === "deleted";
    await db.update(providerConnection).set({ status: permission ? "expired" : conn.status, lastError: pe?.message ?? "Refresh failed", updatedAt: new Date() }).where(eq(providerConnection.id, conn.id));
    if (permission) {
      const health = { tokenOk: false, permissionsOk: false, lastCheckedAt: new Date().toISOString(), message: pe?.message ?? "Reconnect required", errorCategory: pe?.category };
      await db.update(channel).set({ status: "action_required", health, updatedAt: new Date() }).where(and(eq(channel.connectionId, conn.id), inArray(channel.status, ["healthy", "degraded", "syncing"])));
    }
    l.warn("credential refresh failed", { category: pe?.category ?? "unknown", permission });
    return false;
  }
}
