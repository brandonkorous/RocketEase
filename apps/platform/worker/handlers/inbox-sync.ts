import { and, eq } from "drizzle-orm";
import { ProviderError } from "@make-it-social/providers";
import { db } from "@/db";
import { syncCursor } from "@/db/schema/connections";
import { ingestItems, wakeSnoozed } from "@/lib/engagement/ingest";
import type { JobPayloads } from "@/lib/jobs/queues";
import { getAdapter, loadCredential, toDescriptor } from "@/lib/providers";
import type { HandlerContext } from "./index";

const RESOURCE = "inbox";

/**
 * Poll one channel for new inbox items and ingest them. The cursor row keeps
 * the provider cursor plus the newest item time so overlapping polls dedupe.
 */
export async function inboxSync(data: JobPayloads["inbox.sync"], ctx: HandlerContext) {
  const ch = await db.query.channel.findFirst({ where: (c, { eq }) => eq(c.id, data.channelId) });
  if (!ch || !["healthy", "degraded"].includes(ch.status)) return;
  const caps = ch.capabilities.inbox;
  if (!caps.comments && !caps.mentions && !caps.messages && !caps.reviews) return;
  const conn = await db.query.providerConnection.findFirst({ where: (c, { eq }) => eq(c.id, ch.connectionId) });
  if (!conn) return;
  const adapter = getAdapter(conn.provider);
  if (!adapter.fetchInbox) return;
  const l = ctx.log.child({ channelId: ch.id, reason: data.reason });

  const cursor = await db.query.syncCursor.findFirst({ where: (s, { and, eq }) => and(eq(s.channelId, ch.id), eq(s.resource, RESOURCE)) });
  try {
    const cred = await loadCredential(conn);
    const page = await adapter.fetchInbox(cred, toDescriptor(ch), { since: cursor?.freshAt?.toISOString(), cursor: cursor?.cursor ?? undefined });
    const created = await ingestItems(ch, page.items);
    const newest = page.items.reduce((m, i) => (i.occurredAt > m ? i.occurredAt : m), cursor?.freshAt?.toISOString() ?? "");
    await db
      .insert(syncCursor)
      .values({ channelId: ch.id, resource: RESOURCE, cursor: page.cursor ?? null, freshAt: newest ? new Date(newest) : new Date(), lastSuccessAt: new Date(), lastError: null, attempts: 0 })
      .onConflictDoUpdate({ target: [syncCursor.channelId, syncCursor.resource], set: { cursor: page.cursor ?? null, freshAt: newest ? new Date(newest) : new Date(), lastSuccessAt: new Date(), lastError: null, attempts: 0, updatedAt: new Date() } });
    await wakeSnoozed(ch.workspaceId);
    l.info("inbox synced", { fetched: page.items.length, created });
  } catch (err) {
    const msg = err instanceof ProviderError ? `${err.category}: ${err.message}` : String(err);
    await db
      .insert(syncCursor)
      .values({ channelId: ch.id, resource: RESOURCE, lastError: msg, attempts: 1 })
      .onConflictDoUpdate({ target: [syncCursor.channelId, syncCursor.resource], set: { lastError: msg, attempts: (cursor?.attempts ?? 0) + 1, updatedAt: new Date() } });
    if (err instanceof ProviderError && err.category === "permission") {
      l.warn("inbox sync lost permission", { err: msg });
      return; // channel.sync owns the health transition; don't burn retries
    }
    throw err;
  }
}

export const inboxCursorWhere = (channelId: string) => and(eq(syncCursor.channelId, channelId), eq(syncCursor.resource, RESOURCE));
