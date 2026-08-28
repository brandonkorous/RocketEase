"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { campaignContent, campaignEvent } from "@/db/schema/campaigns";
import { contentItem } from "@/db/schema/content";
import { audit } from "@/lib/audit";
import { requireCapability } from "@/lib/session";
import { fail, guard, type ActionState } from "../content/shared";

async function loadPair(workspaceId: string, campaignId: string, contentItemId: string) {
  const [c, item] = await Promise.all([
    db.query.campaign.findFirst({ where: (x, { and, eq }) => and(eq(x.id, campaignId), eq(x.workspaceId, workspaceId)) }),
    db.query.contentItem.findFirst({ where: (x, { and, eq, isNull }) => and(eq(x.id, contentItemId), eq(x.workspaceId, workspaceId), isNull(x.deletedAt)) }),
  ]);
  return { c, item };
}

/** Attach a content item (campaigns.draft). The join table is authoritative; content_item.campaign_id mirrors it for calendar/list filters. */
export async function attachContent(workspaceId: string, campaignId: string, contentItemId: string): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "campaigns.draft");
    const { c, item } = await loadPair(workspaceId, campaignId, contentItemId);
    if (!c || c.archivedAt) return fail("Campaign not found.");
    if (!item) return fail("Content item not found.");
    await db.transaction(async (tx) => {
      await tx.insert(campaignContent).values({ workspaceId, campaignId: c.id, contentItemId: item.id, addedByUserId: ctx.session.user.id }).onConflictDoNothing();
      await tx.update(contentItem).set({ campaignId: c.id, updatedAt: new Date() }).where(eq(contentItem.id, item.id));
      await tx.insert(campaignEvent).values({ workspaceId, campaignId: c.id, kind: "content_attached", actorUserId: ctx.session.user.id, data: { contentItemId: item.id, title: item.title } });
    });
    await audit({ action: "campaign.content.attach", actorUserId: ctx.session.user.id, organizationId: c.organizationId, workspaceId, targetType: "campaign", targetId: c.id, summary: { after: { contentItemId: item.id } } });
    return { ok: `"${item.title}" added to ${c.name}.` };
  });
}

export async function detachContent(workspaceId: string, campaignId: string, contentItemId: string): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "campaigns.draft");
    const { c, item } = await loadPair(workspaceId, campaignId, contentItemId);
    if (!c) return fail("Campaign not found.");
    if (!item) return fail("Content item not found.");
    await db.transaction(async (tx) => {
      await tx.delete(campaignContent).where(and(eq(campaignContent.campaignId, c.id), eq(campaignContent.contentItemId, item.id)));
      if (item.campaignId === c.id) await tx.update(contentItem).set({ campaignId: null, updatedAt: new Date() }).where(eq(contentItem.id, item.id));
      await tx.insert(campaignEvent).values({ workspaceId, campaignId: c.id, kind: "content_detached", actorUserId: ctx.session.user.id, data: { contentItemId: item.id, title: item.title } });
    });
    await audit({ action: "campaign.content.detach", actorUserId: ctx.session.user.id, organizationId: c.organizationId, workspaceId, targetType: "campaign", targetId: c.id, summary: { before: { contentItemId: item.id } } });
    return { ok: `"${item.title}" removed from ${c.name}.` };
  });
}
