/*
 * Provider-initiated deauthorization and data deletion.
 *
 * Meta calls these when someone removes RocketEase from their Facebook or
 * Instagram settings, and re-tests them after launch: a callback that
 * acknowledges but does not delete is an enforcement risk. The work runs
 * through the same code path as a manual disconnect, so the outcome is
 * identical — token revoked and deleted at once, cached Platform Data gone.
 */
import { randomBytes } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { ProviderKey } from "@rocketease/providers";
import { db } from "@/db";
import { channel, providerConnection, providerDeletionRequest, type DeletionRequestKind } from "@/db/schema/connections";
import { getAdapter, loadCredential } from "@/lib/providers";
import { log } from "@/lib/log";

/** Statuses that still hold a usable credential. */
const LIVE_CHANNEL = ["connecting", "syncing", "healthy", "degraded", "action_required"] as const;

export const confirmationCode = () => randomBytes(16).toString("hex");

/** Record the request and hand back the code the provider expects immediately. */
export async function recordDeletionRequest(input: {
  provider: ProviderKey;
  kind: DeletionRequestKind;
  remoteUserId: string;
}) {
  const [row] = await db
    .insert(providerDeletionRequest)
    .values({ ...input, confirmationCode: confirmationCode() })
    .returning({ id: providerDeletionRequest.id, confirmationCode: providerDeletionRequest.confirmationCode });
  return row;
}

/**
 * Erase every connection this provider identity owns. Idempotent: a second run
 * finds nothing live and completes cleanly, which is what a provider retry needs.
 */
export async function runProviderDeletion(requestId: string): Promise<void> {
  const request = await db.query.providerDeletionRequest.findFirst({ where: (r, { eq }) => eq(r.id, requestId) });
  if (!request || request.status === "completed") return;

  await db.update(providerDeletionRequest).set({ status: "processing" }).where(eq(providerDeletionRequest.id, requestId));

  try {
    const result = await erase(request.provider, request.remoteUserId);
    await db
      .update(providerDeletionRequest)
      .set({ status: result.connections === 0 ? "no_match" : "completed", result, completedAt: new Date() })
      .where(eq(providerDeletionRequest.id, requestId));
  } catch (e) {
    const error = e instanceof Error ? e.message : "unknown error";
    log.error("provider deletion failed", { requestId, error });
    await db.update(providerDeletionRequest).set({ status: "failed", error }).where(eq(providerDeletionRequest.id, requestId));
    throw e;
  }
}

async function erase(provider: ProviderKey, remoteUserId: string) {
  const connections = await db
    .select()
    .from(providerConnection)
    .where(and(eq(providerConnection.provider, provider), eq(providerConnection.providerUserId, remoteUserId)));

  let channels = 0;
  for (const conn of connections) {
    channels += await disconnectConnection(conn.id, provider, conn.status);
  }
  return { connections: connections.length, channels, note: "Tokens deleted. Cached provider data is removed within 30 days." };
}

/** Revoke remotely where we can, then scrub every stored secret. */
async function disconnectConnection(connectionId: string, provider: ProviderKey, status: string): Promise<number> {
  const live = await db
    .select({ id: channel.id })
    .from(channel)
    .where(and(eq(channel.connectionId, connectionId), inArray(channel.status, [...LIVE_CHANNEL])));

  if (status !== "disconnected") {
    const conn = await db.query.providerConnection.findFirst({ where: (c, { eq }) => eq(c.id, connectionId) });
    if (conn) {
      try {
        await getAdapter(provider).revoke(await loadCredential(conn));
      } catch {
        /* the provider has usually revoked already — that is why it called us */
      }
    }
  }

  await db
    .update(channel)
    .set({ status: "revoked", channelSecret: null, disconnectedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(channel.connectionId, connectionId), inArray(channel.status, [...LIVE_CHANNEL])));

  await db
    .update(providerConnection)
    .set({ status: "revoked", secret: { v: 1, keyId: "scrubbed", iv: "", tag: "", ct: "" }, lastError: "Revoked by the account holder at the provider.", updatedAt: new Date() })
    .where(eq(providerConnection.id, connectionId));

  return live.length;
}
