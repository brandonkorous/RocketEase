import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { ProviderError } from "@rocketease/providers";
import { db } from "@/db";
import { remotePublication } from "@/db/schema/content";
import type { JobPayloads } from "@/lib/jobs/queues";
import { getAdapter, loadCredential, toDescriptor } from "@/lib/providers";
import type { HandlerContext } from "./index";

const BATCH = 200;

/**
 * Nightly reconciliation of remote publications: ask the provider whether each
 * post still exists and record deleted/unknown. Only rows not checked in the
 * last 20h are touched, so re-delivery of the job is harmless.
 */
export async function publicationReconcile(data: JobPayloads["publication.reconcile"], ctx: HandlerContext) {
  const cutoff = new Date(Date.now() - 20 * 3_600_000);
  const stale = or(isNull(remotePublication.lastCheckedAt), lt(remotePublication.lastCheckedAt, cutoff));
  const rows = await db
    .select()
    .from(remotePublication)
    .where(and(eq(remotePublication.state, "published"), stale, ...(data.channelId ? [eq(remotePublication.channelId, data.channelId)] : [])))
    .orderBy(sql`${remotePublication.lastCheckedAt} nulls first`)
    .limit(data.limit ?? BATCH);
  const byChannel = new Map<string, typeof rows>();
  for (const r of rows) byChannel.set(r.channelId, [...(byChannel.get(r.channelId) ?? []), r]);
  let checked = 0;
  for (const [channelId, pubs] of byChannel) {
    if (ctx.signal.aborted) break;
    checked += await reconcileChannel(channelId, pubs, ctx);
  }
  ctx.log.info("publications reconciled", { candidates: rows.length, checked });
}

async function reconcileChannel(channelId: string, pubs: (typeof remotePublication.$inferSelect)[], ctx: HandlerContext): Promise<number> {
  const ch = await db.query.channel.findFirst({ where: (c, { eq }) => eq(c.id, channelId) });
  if (!ch || !["healthy", "degraded"].includes(ch.status)) return 0;
  const conn = await db.query.providerConnection.findFirst({ where: (c, { eq }) => eq(c.id, ch.connectionId) });
  if (!conn) return 0;
  const l = ctx.log.child({ channelId, provider: ch.provider });
  let cred;
  try {
    cred = await loadCredential(conn);
  } catch (err) {
    l.warn("reconcile skipped: credential unavailable", { err });
    return 0;
  }
  const adapter = getAdapter(conn.provider);
  const descriptor = toDescriptor(ch);
  let n = 0;
  for (const p of pubs) {
    try {
      const s = await adapter.publicationStatus(cred, descriptor, p.remoteId);
      const state = s.state === "deleted" ? "deleted" : s.state === "unknown" ? "unknown" : "published";
      await db.update(remotePublication).set({ state, url: s.url ?? p.url, lastCheckedAt: new Date() }).where(eq(remotePublication.id, p.id));
      if (state !== "published") l.info("publication state changed", { publicationId: p.id, state });
      n++;
    } catch (err) {
      const pe = err instanceof ProviderError ? err : null;
      await db.update(remotePublication).set({ state: pe?.category === "deleted" ? "deleted" : "unknown", lastCheckedAt: new Date() }).where(eq(remotePublication.id, p.id));
      l.warn("publication status check failed", { publicationId: p.id, category: pe?.category ?? "unknown" });
      if (pe?.category === "rate_limit" || pe?.category === "permission") break;
    }
  }
  return n;
}
