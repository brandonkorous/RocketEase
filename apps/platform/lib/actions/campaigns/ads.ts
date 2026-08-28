"use server";

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { adAccount, adCampaign, campaignEvent } from "@/db/schema/campaigns";
import { audit } from "@/lib/audit";
import { toAccountDescriptor } from "@/lib/campaigns/paid-import";
import { enqueueAdsSyncs } from "@/lib/campaigns/schedule";
import { emit } from "@/lib/jobs/outbox";
import { getAdapter, loadCredential } from "@/lib/providers";
import { requireCapability } from "@/lib/session";
import { fail, guard, type ActionState } from "../content/shared";

/** Connect one of the ad accounts the provider credential can read (6.3). Read-only import starts immediately. */
export async function connectAdAccount(workspaceId: string, connectionId: string, remoteId: string): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "campaigns.manage");
    const conn = await db.query.providerConnection.findFirst({ where: (c, { and, eq }) => and(eq(c.id, connectionId), eq(c.workspaceId, workspaceId), eq(c.status, "active")) });
    if (!conn) return fail("That connection is not active. Reconnect it under Connected accounts first.");
    const adapter = getAdapter(conn.provider);
    if (!adapter.listAdAccounts) return fail(`${adapter.displayName} does not expose ad accounts.`);
    const desc = (await adapter.listAdAccounts(await loadCredential(conn))).find((a) => a.remoteId === remoteId);
    if (!desc) return fail("That ad account is no longer available to this login.");
    const ch = await db.query.channel.findFirst({ where: (c, { and, eq, inArray }) => and(eq(c.connectionId, conn.id), inArray(c.status, ["healthy", "degraded"])), orderBy: (c, { asc }) => asc(c.createdAt) });
    const values = { organizationId: conn.organizationId, workspaceId, connectionId: conn.id, channelId: ch?.id ?? null, provider: conn.provider, remoteId: desc.remoteId, name: desc.name, currency: desc.currency, timezone: desc.timezone ?? null, status: desc.status, managerUrl: desc.managerUrl ?? null, connectedByUserId: ctx.session.user.id, disconnectedAt: null, updatedAt: new Date() };
    const id = await db.transaction(async (tx) => {
      const [row] = await tx.insert(adAccount).values(values).onConflictDoUpdate({ target: [adAccount.workspaceId, adAccount.provider, adAccount.remoteId], set: values }).returning({ id: adAccount.id });
      await emit(tx, "ads.sync", { adAccountId: row.id }, { organizationId: conn.organizationId, workspaceId, dedupeKey: `ads.sync:${row.id}` });
      return row.id;
    });
    await audit({ action: "ad_account.connect", actorUserId: ctx.session.user.id, organizationId: conn.organizationId, workspaceId, targetType: "ad_account", targetId: id, summary: { after: { remoteId: desc.remoteId, name: desc.name, currency: desc.currency, channelId: ch?.id ?? null } } });
    return { ok: `${desc.name} connected. Importing paid results now.` };
  });
}

export async function disconnectAdAccount(workspaceId: string, adAccountId: string): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "campaigns.manage");
    const a = await db.query.adAccount.findFirst({ where: (x, { and, eq }) => and(eq(x.id, adAccountId), eq(x.workspaceId, workspaceId)) });
    if (!a) return fail("Ad account not found.");
    await db.update(adAccount).set({ disconnectedAt: new Date(), updatedAt: new Date() }).where(eq(adAccount.id, a.id));
    await audit({ action: "ad_account.disconnect", actorUserId: ctx.session.user.id, organizationId: a.organizationId, workspaceId, targetType: "ad_account", targetId: a.id });
    return { ok: `${a.name} disconnected. Imported history is kept.` };
  });
}

/** Ask the worker to re-import every connected ad account now. */
export async function syncAdsNow(workspaceId: string): Promise<ActionState> {
  return guard(async () => {
    await requireCapability(workspaceId, "campaigns.analyze");
    const n = await enqueueAdsSyncs(workspaceId);
    return { ok: n ? `Refreshing ${n} ad account${n > 1 ? "s" : ""}.` : "No ad account is connected yet." };
  });
}

/** Link an imported ad campaign to a campaign for attribution (null = unlink). */
export async function linkAdCampaign(workspaceId: string, adCampaignId: string, campaignId: string | null): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "campaigns.manage");
    const ac = await db.query.adCampaign.findFirst({ where: (x, { and, eq }) => and(eq(x.id, adCampaignId), eq(x.workspaceId, workspaceId)) });
    if (!ac) return fail("Ad campaign not found.");
    const target = campaignId ? await db.query.campaign.findFirst({ where: (x, { and, eq }) => and(eq(x.id, campaignId), eq(x.workspaceId, workspaceId), isNull(x.archivedAt)) }) : null;
    if (campaignId && !target) return fail("Campaign not found.");
    await db.transaction(async (tx) => {
      await tx.update(adCampaign).set({ campaignId: target?.id ?? null, updatedAt: new Date() }).where(eq(adCampaign.id, ac.id));
      for (const cid of [ac.campaignId, target?.id].filter((x): x is string => !!x)) await tx.insert(campaignEvent).values({ workspaceId, campaignId: cid, kind: cid === target?.id ? "ad_campaign_linked" : "ad_campaign_unlinked", actorUserId: ctx.session.user.id, data: { adCampaignId: ac.id, name: ac.name } });
    });
    await audit({ action: "ad_campaign.link", actorUserId: ctx.session.user.id, organizationId: ac.organizationId, workspaceId, targetType: "ad_campaign", targetId: ac.id, summary: { before: ac.campaignId, after: target?.id ?? null } });
    return { ok: target ? `Linked to ${target.name}.` : "Unlinked." };
  });
}

/** Pause/resume an imported ad campaign where the provider allows it. Not a spend increase, but still audited. */
export async function setAdCampaignStatus(workspaceId: string, adCampaignId: string, status: "active" | "paused"): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "campaigns.manage");
    const ac = await db.query.adCampaign.findFirst({ where: (x, { and, eq }) => and(eq(x.id, adCampaignId), eq(x.workspaceId, workspaceId)) });
    const account = ac && (await db.query.adAccount.findFirst({ where: (x, { eq }) => eq(x.id, ac.adAccountId) }));
    const conn = account && (await db.query.providerConnection.findFirst({ where: (c, { eq }) => eq(c.id, account.connectionId) }));
    if (!ac || !account || !conn) return fail("Ad campaign not found.");
    const adapter = getAdapter(conn.provider);
    if (!adapter.setPaidObjectStatus) return fail(`${adapter.displayName} only supports read-only import here. Change status in the native manager.`);
    await adapter.setPaidObjectStatus(await loadCredential(conn), toAccountDescriptor(account), ac.remoteId, status);
    await db.update(adCampaign).set({ status, updatedAt: new Date() }).where(and(eq(adCampaign.id, ac.id)));
    if (ac.campaignId) await db.insert(campaignEvent).values({ workspaceId, campaignId: ac.campaignId, kind: "ad_campaign_status", actorUserId: ctx.session.user.id, data: { adCampaignId: ac.id, name: ac.name, status } });
    await audit({ action: `ad_campaign.${status === "active" ? "resume" : "pause"}`, actorUserId: ctx.session.user.id, organizationId: ac.organizationId, workspaceId, targetType: "ad_campaign", targetId: ac.id, summary: { before: ac.status, after: status } });
    return { ok: status === "paused" ? `${ac.name} paused.` : `${ac.name} resumed.` };
  });
}
