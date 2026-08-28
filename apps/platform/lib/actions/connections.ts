"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { ProviderError, type ChannelDescriptor } from "@make-it-social/providers";
import { db } from "@/db";
import { channel, providerConnection } from "@/db/schema/connections";
import { audit } from "@/lib/audit";
import { track } from "@/lib/telemetry";
import { AuthorizationError } from "@/lib/authz";
import { emit } from "@/lib/jobs/outbox";
import { getAdapter, loadCredential, sealChannelToken } from "@/lib/providers";
import { requireCapability } from "@/lib/session";
import { workspacePath } from "@/lib/nav";

export type ActionState = { error?: string; ok?: string };
const fail = (error: string): ActionState => ({ error });
const guard = async <T>(fn: () => Promise<T>): Promise<T | ActionState> => {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AuthorizationError) return fail("You don't have permission to manage connected accounts.");
    if (e instanceof ProviderError) return fail(e.message);
    throw e;
  }
};

/** Step 5: the user explicitly picks which channels join THIS workspace. */
export async function selectChannels(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z
    .object({ workspaceId: z.string().min(1), connectionId: z.string().min(1), selected: z.array(z.string()).min(1, "Choose at least one account") })
    .safeParse({ workspaceId: formData.get("workspaceId"), connectionId: formData.get("connectionId"), selected: formData.getAll("selected").map(String) });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Choose at least one account");
  const { workspaceId, connectionId, selected } = parsed.data;

  const res = await guard(async () => {
    const ctx = await requireCapability(workspaceId, "channels.manage");
    const conn = await db.query.providerConnection.findFirst({ where: (c, { and, eq }) => and(eq(c.id, connectionId), eq(c.workspaceId, workspaceId)) });
    if (!conn) return fail("Connection not found.");
    const adapter = getAdapter(conn.provider);
    const cred = await loadCredential(conn);
    const available = await adapter.listChannels(cred);
    const chosen = available.filter((c) => selected.includes(`${c.kind}:${c.remoteId}`));
    if (chosen.length === 0) return fail("Those accounts are no longer available. Try reconnecting.");

    const created: string[] = [];
    await db.transaction(async (tx) => {
      for (const c of chosen) {
        const [row] = await tx
          .insert(channel)
          .values({
            organizationId: conn.organizationId,
            workspaceId,
            connectionId: conn.id,
            provider: conn.provider,
            network: c.network,
            kind: c.kind,
            remoteId: c.remoteId,
            name: c.name,
            handle: c.handle,
            avatarUrl: c.avatarUrl,
            capabilities: c.capabilities,
            status: "syncing",
          })
          .onConflictDoUpdate({
            target: [channel.workspaceId, channel.provider, channel.remoteId],
            set: { connectionId: conn.id, name: c.name, handle: c.handle, avatarUrl: c.avatarUrl, capabilities: c.capabilities, status: "syncing", disconnectedAt: null, updatedAt: new Date() },
          })
          .returning({ id: channel.id });
        if (c.channelToken) await tx.update(channel).set({ channelSecret: sealChannelToken(row.id, c.channelToken) }).where(eq(channel.id, row.id));
        created.push(row.id);
        await emit(tx, "channel.sync", { channelId: row.id, reason: "initial" }, { organizationId: conn.organizationId, workspaceId, dedupeKey: `channel.sync:${row.id}` });
      }
      await tx.update(providerConnection).set({ status: "active", updatedAt: new Date() }).where(eq(providerConnection.id, conn.id));
    });
    await audit({
      action: "channel.connect",
      actorUserId: ctx.session.user.id,
      organizationId: conn.organizationId,
      workspaceId,
      targetType: "provider_connection",
      targetId: conn.id,
      summary: { after: { channels: chosen.map((c) => ({ kind: c.kind, remoteId: c.remoteId, name: c.name })) } },
    });
    await track("channel_connected", { userId: ctx.session.user.id, organizationId: conn.organizationId, workspaceId, surface: "action:selectChannels", props: { provider: conn.provider, channels: chosen.length } });
    return { ok: "ok", created } as ActionState & { created: string[] };
  });
  if ("error" in res && res.error) return res;
  revalidatePath(workspacePath(workspaceId, "accounts"));
  const next = String(formData.get("next") ?? "");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : `${workspacePath(workspaceId, "accounts")}?connected=1`);
}

/** Abandon a connection that never had channels selected (cancel on the select screen). */
export async function discardConnection(workspaceId: string, connectionId: string): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "channels.manage");
    const conn = await db.query.providerConnection.findFirst({ where: (c, { and, eq }) => and(eq(c.id, connectionId), eq(c.workspaceId, workspaceId), eq(c.status, "selecting")) });
    if (!conn) return fail("Nothing to discard.");
    try {
      await getAdapter(conn.provider).revoke(await loadCredential(conn));
    } catch {
      /* best effort */
    }
    await db.delete(providerConnection).where(eq(providerConnection.id, conn.id));
    await audit({ action: "connection.discard", actorUserId: ctx.session.user.id, organizationId: conn.organizationId, workspaceId, targetType: "provider_connection", targetId: conn.id });
    revalidatePath(workspacePath(workspaceId, "accounts"));
    return { ok: "Connection discarded." };
  });
}

/**
 * Disconnect: stop future actions/sync, revoke remotely when possible, remove
 * secrets, keep historical rows (integrations.md "Connection states").
 */
export async function disconnectChannel(workspaceId: string, channelId: string): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "channels.manage");
    const ch = await db.query.channel.findFirst({ where: (c, { and, eq }) => and(eq(c.id, channelId), eq(c.workspaceId, workspaceId)) });
    if (!ch) return fail("Channel not found.");
    await db.update(channel).set({ status: "disconnected", channelSecret: null, disconnectedAt: new Date(), updatedAt: new Date() }).where(eq(channel.id, ch.id));

    // If no live channels remain on the connection, revoke and scrub the connection secret too.
    const remaining = await db.select({ id: channel.id }).from(channel).where(and(eq(channel.connectionId, ch.connectionId), inArray(channel.status, ["connecting", "syncing", "healthy", "degraded", "action_required"])));
    if (remaining.length === 0) {
      const conn = await db.query.providerConnection.findFirst({ where: (c, { eq }) => eq(c.id, ch.connectionId) });
      if (conn && conn.status !== "disconnected") {
        try {
          await getAdapter(conn.provider).revoke(await loadCredential(conn));
        } catch {
          /* provider may already have revoked */
        }
        await db.update(providerConnection).set({ status: "disconnected", secret: { v: 1, keyId: "scrubbed", iv: "", tag: "", ct: "" }, updatedAt: new Date() }).where(eq(providerConnection.id, conn.id));
      }
    }
    await audit({ action: "channel.disconnect", actorUserId: ctx.session.user.id, organizationId: ch.organizationId, workspaceId, targetType: "channel", targetId: ch.id, summary: { before: { name: ch.name, status: ch.status } } });
    revalidatePath(workspacePath(workspaceId, "accounts"));
    return { ok: `${ch.name} disconnected. Scheduled posts to it will fail until reconnected; history is kept.` };
  });
}

/** Manual "check now": re-sync capabilities and health. */
export async function resyncChannel(workspaceId: string, channelId: string): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "channels.manage");
    const ch = await db.query.channel.findFirst({ where: (c, { and, eq }) => and(eq(c.id, channelId), eq(c.workspaceId, workspaceId)) });
    if (!ch) return fail("Channel not found.");
    await db.update(channel).set({ status: "syncing", updatedAt: new Date() }).where(eq(channel.id, ch.id));
    await emit(db, "channel.sync", { channelId: ch.id, reason: "scheduled" }, { organizationId: ch.organizationId, workspaceId, dedupeKey: `channel.sync:${ch.id}` });
    void ctx;
    revalidatePath(workspacePath(workspaceId, "accounts"));
    return { ok: "Checking…" };
  });
}

export type { ChannelDescriptor };
