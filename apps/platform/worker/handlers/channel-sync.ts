import { eq } from "drizzle-orm";
import { ProviderError } from "@rocketease/providers";
import { db } from "@/db";
import { channel } from "@/db/schema/connections";
import type { JobPayloads } from "@/lib/jobs/queues";
import { getAdapter, loadCredential, sealChannelToken } from "@/lib/providers";
import type { HandlerContext } from "./index";

/**
 * Re-describe a channel: capabilities, identity, and health. Maps provider
 * errors to connection states (integrations.md). Idempotent.
 */
export async function channelSync(data: JobPayloads["channel.sync"], ctx: HandlerContext) {
  const ch = await db.query.channel.findFirst({ where: (c, { eq }) => eq(c.id, data.channelId) });
  if (!ch || ch.status === "disconnected") return;
  const conn = await db.query.providerConnection.findFirst({ where: (c, { eq }) => eq(c.id, ch.connectionId) });
  if (!conn) return;
  const l = ctx.log.child({ channelId: ch.id, provider: ch.provider, reason: data.reason });

  try {
    const adapter = getAdapter(conn.provider);
    const cred = await loadCredential(conn);
    const d = await adapter.describeChannel(cred, ch.remoteId, ch.kind);
    const publishable = d.capabilities.formats.length > 0;
    const probe = adapter.healthCheck ? await adapter.healthCheck(cred, d) : { tokenOk: true, permissionsOk: publishable, missingScopes: [], message: undefined };
    const status = !probe.tokenOk ? "action_required" : publishable && probe.permissionsOk ? "healthy" : "degraded";
    const message = probe.message ?? (publishable ? undefined : (d.capabilities.reasons?.formats ?? "Limited permissions"));
    await db
      .update(channel)
      .set({
        name: d.name,
        handle: d.handle ?? null,
        avatarUrl: d.avatarUrl ?? null,
        capabilities: d.capabilities,
        channelSecret: d.channelToken ? sealChannelToken(ch.id, d.channelToken) : ch.channelSecret,
        status,
        health: { tokenOk: probe.tokenOk, permissionsOk: probe.tokenOk && probe.permissionsOk && publishable, lastCheckedAt: new Date().toISOString(), message },
        lastSyncAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(channel.id, ch.id));
    l.info("channel synced", { status, missingScopes: probe.missingScopes });
  } catch (err) {
    const pe = err instanceof ProviderError ? err : null;
    const status = pe?.category === "permission" ? "action_required" : pe?.category === "deleted" ? "revoked" : "degraded";
    await db
      .update(channel)
      .set({
        status,
        health: { tokenOk: pe?.category !== "permission", permissionsOk: false, lastCheckedAt: new Date().toISOString(), message: pe?.message ?? "Sync failed", errorCategory: pe?.category ?? "unknown" },
        updatedAt: new Date(),
      })
      .where(eq(channel.id, ch.id));
    l.warn("channel sync failed", { status, err });
    if (pe && !pe.retryable) return; // permanent: don't burn retries
    throw err;
  }
}
