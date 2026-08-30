import "server-only";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { adAccount } from "@/db/schema/campaigns";
import { channel, providerConnection, syncCursor } from "@/db/schema/connections";
import { channelQuotas } from "@/lib/channel-quota";
import { providers } from "@/lib/providers";
import { conversionState } from "@/lib/tracking/conversions";
import { trackingKindEnabled } from "@/lib/tracking/sources";
import type { WorkspaceContext } from "@/lib/session";
import { hasCapability } from "@/lib/session";
import { adsRow, connectionManagesAds, socialRow, trackingRow } from "./rows";
import { railLists } from "./rail";
import type { SurfaceState } from "./surface-health";
import type { AccountsData, IntegrationRow } from "./types";

/** Everything the Connected accounts screen renders, in one workspace-scoped read. */
export async function accountsData(ctx: WorkspaceContext): Promise<AccountsData> {
  const workspaceId = ctx.workspace.id;
  const tz = ctx.workspace.timezone;
  const canManage = hasCapability(ctx.workspace, "channels.manage");

  const [conns, chans, ads, tracking] = await Promise.all([
    db.select().from(providerConnection).where(eq(providerConnection.workspaceId, workspaceId)).orderBy(desc(providerConnection.createdAt)),
    db.select().from(channel).where(eq(channel.workspaceId, workspaceId)).orderBy(channel.name),
    db
      .select({ a: adAccount, network: channel.network })
      .from(adAccount)
      .leftJoin(channel, eq(adAccount.channelId, channel.id))
      .where(and(eq(adAccount.workspaceId, workspaceId), isNull(adAccount.disconnectedAt))),
    conversionState(workspaceId),
  ]);
  const quotas = await channelQuotas(workspaceId, tz, chans);
  // Per-surface sync state, so a channel that cannot ingest stops claiming "All systems go".
  const cursorRows = chans.length
    ? await db.select({ channelId: syncCursor.channelId, resource: syncCursor.resource, lastError: syncCursor.lastError }).from(syncCursor).where(inArray(syncCursor.channelId, chans.map((c) => c.id)))
    : [];
  const surfacesByChannel = new Map<string, SurfaceState[]>();
  for (const c of cursorRows) surfacesByChannel.set(c.channelId, [...(surfacesByChannel.get(c.channelId) ?? []), { resource: c.resource, lastError: c.lastError }]);

  const byConnection = new Map(conns.map((c) => [c.id, c]));
  const live = chans.filter((ch) => ch.status !== "disconnected");
  const rows: IntegrationRow[] = live.flatMap((ch) => {
    const conn = byConnection.get(ch.connectionId);
    if (!conn || conn.status === "selecting") return [];
    return [socialRow(ch, conn, quotas.find((q) => q.channelId === ch.id) ?? null, tz, workspaceId, canManage, surfacesByChannel.get(ch.id) ?? [])];
  });

  for (const { a, network } of ads) {
    const caps = live.filter((ch) => ch.connectionId === a.connectionId).map((ch) => ch.capabilities);
    rows.push(adsRow({ ...a, network, canManageAds: connectionManagesAds(caps) }, tz, workspaceId));
  }
  for (const s of tracking.sources) {
    if (s.status === "disconnected") continue;
    rows.push(trackingRow(s, tz, workspaceId));
  }

  // A network with any live connection is not "available" — reconnecting it is the Expiring card's job.
  const connectedProviders = new Set(conns.filter((c) => c.status !== "disconnected").map((c) => c.provider));
  const connectable = [...providers().values()].map((p) => ({ key: p.key, displayName: p.displayName, networks: p.networks, accessSummary: p.accessSummary }));
  const connectedKinds = new Set(tracking.sources.filter((s) => s.status !== "disconnected").map((s) => s.kind));

  return {
    workspaceId,
    canManage,
    rows,
    connectable: connectable.map(({ key, displayName, networks }) => ({ key, displayName, networks })),
    ...railLists({
      workspaceId,
      rows,
      conns,
      connectable,
      connectedProviders,
      connectedKinds,
      trackingEnabled: { ga4: trackingKindEnabled("ga4"), shopify: trackingKindEnabled("shopify") },
      tz,
    }),
  };
}
