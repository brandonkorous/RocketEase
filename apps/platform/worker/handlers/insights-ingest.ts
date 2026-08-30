import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { ProviderError, type InsightFact } from "@rocketease/providers";
import { db } from "@/db";
import { metricFact } from "@/db/schema/analytics";
import { syncCursor } from "@/db/schema/connections";
import { remotePublication } from "@/db/schema/content";
import type { JobPayloads } from "@/lib/jobs/queues";
import { getAdapter, loadCredential, toDescriptor } from "@/lib/providers";
import type { HandlerContext } from "./index";

const RESOURCE = "insights";
const LOOKBACK_DAYS = 3; // providers revise recent days; always re-pull a short tail
const INITIAL_DAYS = 28;
const dayStr = (d: Date) => d.toISOString().slice(0, 10);

/** Upsert facts; a changed value bumps revision so reports can flag it. Returns {inserted, revised}. */
async function upsertFacts(ch: { id: string; organizationId: string; workspaceId: string }, facts: InsightFact[]) {
  let inserted = 0;
  let revised = 0;
  for (const f of facts) {
    const [row] = await db
      .insert(metricFact)
      .values({ organizationId: ch.organizationId, workspaceId: ch.workspaceId, channelId: ch.id, entity: f.entity, remoteId: f.remoteId ?? "", metric: f.metric, day: f.day, value: String(f.value), source: f.source })
      .onConflictDoUpdate({
        target: [metricFact.channelId, metricFact.entity, metricFact.remoteId, metricFact.metric, metricFact.day, metricFact.scope],
        set: { value: String(f.value), source: f.source, freshAt: new Date(), revision: sql`case when ${metricFact.value} <> ${String(f.value)}::numeric then ${metricFact.revision} + 1 else ${metricFact.revision} end` },
      })
      .returning({ revision: metricFact.revision, created: sql<boolean>`(xmax = 0)` });
    if (row?.created) inserted++;
    else if (row && row.revision > 1) revised++;
  }
  return { inserted, revised };
}

/** Pull organic insights for one channel (channel series + posts published in the window). */
export async function insightsIngest(data: JobPayloads["insights.ingest"], ctx: HandlerContext) {
  const ch = await db.query.channel.findFirst({ where: (c, { eq }) => eq(c.id, data.channelId) });
  if (!ch || !["healthy", "degraded"].includes(ch.status) || !ch.capabilities.insights.organic) return;
  const conn = await db.query.providerConnection.findFirst({ where: (c, { eq }) => eq(c.id, ch.connectionId) });
  if (!conn) return;
  const adapter = getAdapter(conn.provider);
  if (!adapter.fetchInsights) return;
  const l = ctx.log.child({ channelId: ch.id });
  const cursor = await db.query.syncCursor.findFirst({ where: (s, { and, eq }) => and(eq(s.channelId, ch.id), eq(s.resource, RESOURCE)) });
  const until = new Date();
  const since = data.since ? new Date(data.since) : cursor?.freshAt ? new Date(cursor.freshAt.getTime() - LOOKBACK_DAYS * 86_400_000) : new Date(until.getTime() - INITIAL_DAYS * 86_400_000);
  try {
    const cred = await loadCredential(conn);
    const posts = await db.select({ remoteId: remotePublication.remoteId }).from(remotePublication).where(and(eq(remotePublication.channelId, ch.id), eq(remotePublication.state, "published"), gte(remotePublication.publishedAt, new Date(since.getTime() - 30 * 86_400_000))));
    const page = await adapter.fetchInsights(cred, toDescriptor(ch), { since: dayStr(since), until: dayStr(until), postRemoteIds: posts.map((p) => p.remoteId) });
    const { inserted, revised } = await upsertFacts(ch, page.facts);
    // A partial page is a success, not a failure: the rest of the metrics are
    // real. Say which ones the network has retired instead of leaving a gap.
    const retired = page.unsupportedMetrics?.length ? `${ch.name}: ${ch.network} no longer reports ${page.unsupportedMetrics.join(", ")}. Every other metric is up to date.` : null;
    await db
      .insert(syncCursor)
      .values({ channelId: ch.id, resource: RESOURCE, freshAt: until, lastSuccessAt: until, lastError: retired, attempts: 0 })
      .onConflictDoUpdate({ target: [syncCursor.channelId, syncCursor.resource], set: { freshAt: until, lastSuccessAt: until, lastError: retired, attempts: 0, updatedAt: until } });
    if (retired) l.warn("insights metrics retired by provider", { unsupported: page.unsupportedMetrics });
    l.info("insights ingested", { facts: page.facts.length, inserted, revised, posts: posts.length });
  } catch (err) {
    const msg = err instanceof ProviderError ? `${err.category}: ${err.message}` : String(err);
    await db.insert(syncCursor).values({ channelId: ch.id, resource: RESOURCE, lastError: msg, attempts: 1 }).onConflictDoUpdate({ target: [syncCursor.channelId, syncCursor.resource], set: { lastError: msg, attempts: (cursor?.attempts ?? 0) + 1, updatedAt: new Date() } });
    if (err instanceof ProviderError && err.category === "permission") { l.warn("insights lost permission", { err: msg }); return; }
    throw err;
  }
}

/** Every insight-capable channel in the given workspaces (or all). */
export async function insightChannels(workspaceIds?: string[]) {
  const rows = await db.query.channel.findMany({ where: (c, { and, inArray: inArr }) => and(inArr(c.status, ["healthy", "degraded"]), ...(workspaceIds ? [inArray(c.workspaceId, workspaceIds)] : [])) });
  return rows.filter((c) => c.capabilities.insights.organic);
}
