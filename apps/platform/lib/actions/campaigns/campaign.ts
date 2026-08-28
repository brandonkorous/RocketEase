"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { CAMPAIGN_OBJECTIVES, CAMPAIGN_STATUSES, campaign, campaignEvent, type CampaignObjective, type CampaignStatus, type CampaignTracking } from "@/db/schema/campaigns";
import { audit } from "@/lib/audit";
import { track } from "@/lib/telemetry";
import { requireCapability } from "@/lib/session";
import { zonedToUtc } from "@/lib/time";
import { fail, guard, type ActionState } from "../content/shared";

export type CampaignInput = {
  name: string;
  description: string;
  objective: string;
  /** Local datetime strings in the workspace timezone ("2026-05-12T09:00"); empty = unset. */
  startAt: string;
  endAt: string;
  ownerUserId: string;
  budgetAmount: string;
  currency: string;
  tracking: CampaignTracking;
  tags: string[];
};

type Normalized = { error: string; values?: undefined } | { error?: undefined; values: { name: string; description: string; objective: CampaignObjective; startAt: Date | null; endAt: Date | null; ownerUserId: string | null; budgetAmount: string | null; currency: string; tracking: CampaignTracking; tags: string[] } };

function normalize(input: CampaignInput, tz: string): Normalized {
  const name = input.name.trim();
  if (!name) return { error: "Give the campaign a name." };
  if (!CAMPAIGN_OBJECTIVES.includes(input.objective as CampaignObjective)) return { error: "Pick an objective." };
  const startAt = input.startAt ? zonedToUtc(input.startAt, tz) : null;
  const endAt = input.endAt ? zonedToUtc(input.endAt, tz) : null;
  if (startAt && endAt && endAt <= startAt) return { error: "End date must be after the start date." };
  const budget = input.budgetAmount.trim() ? Number(input.budgetAmount) : null;
  if (budget !== null && (!Number.isFinite(budget) || budget < 0)) return { error: "Budget must be a positive amount." };
  const currency = (input.currency || "USD").trim().toUpperCase().slice(0, 3);
  const tracking: CampaignTracking = { utmSource: input.tracking.utmSource?.trim() || undefined, utmMedium: input.tracking.utmMedium?.trim() || undefined, utmCampaign: input.tracking.utmCampaign?.trim() || undefined, linkTemplate: input.tracking.linkTemplate?.trim() || undefined };
  return { values: { name, description: input.description.trim(), objective: input.objective as CampaignObjective, startAt, endAt, ownerUserId: input.ownerUserId || null, budgetAmount: budget === null ? null : budget.toFixed(2), currency, tracking, tags: input.tags.map((t) => t.trim()).filter(Boolean).slice(0, 20) } };
}

/** Creators may draft (campaigns.draft); only managers activate (campaigns.manage). */
export async function createCampaign(workspaceId: string, input: CampaignInput): Promise<ActionState & { id?: string }> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "campaigns.draft");
    const n = normalize(input, ctx.workspace.timezone);
    if (n.error !== undefined) return fail(n.error);
    const [row] = await db.insert(campaign).values({ ...n.values, organizationId: ctx.workspace.organizationId, workspaceId, ownerUserId: n.values.ownerUserId ?? ctx.session.user.id, createdByUserId: ctx.session.user.id }).returning({ id: campaign.id });
    await db.insert(campaignEvent).values({ workspaceId, campaignId: row.id, kind: "created", actorUserId: ctx.session.user.id, data: { name: n.values.name, objective: n.values.objective } });
    await audit({ action: "campaign.create", actorUserId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId, targetType: "campaign", targetId: row.id, summary: { after: n.values } });
    await track("campaign_created", { organizationId: ctx.workspace.organizationId, workspaceId, surface: "campaigns", props: { objective: n.values.objective } });
    return { ok: "Campaign created.", id: row.id };
  });
}

export async function updateCampaign(workspaceId: string, campaignId: string, input: CampaignInput): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "campaigns.draft");
    const c = await db.query.campaign.findFirst({ where: (x, { and, eq }) => and(eq(x.id, campaignId), eq(x.workspaceId, workspaceId)) });
    if (!c) return fail("Campaign not found.");
    if (c.status !== "draft") await requireCapability(workspaceId, "campaigns.manage");
    const n = normalize(input, ctx.workspace.timezone);
    if (n.error !== undefined) return fail(n.error);
    await db.transaction(async (tx) => {
      await tx.update(campaign).set({ ...n.values, updatedAt: new Date() }).where(eq(campaign.id, c.id));
      await tx.insert(campaignEvent).values({ workspaceId, campaignId: c.id, kind: "updated", actorUserId: ctx.session.user.id, data: { fields: Object.keys(n.values).filter((k) => JSON.stringify((c as Record<string, unknown>)[k]) !== JSON.stringify((n.values as Record<string, unknown>)[k])) } });
    });
    await audit({ action: "campaign.update", actorUserId: ctx.session.user.id, organizationId: c.organizationId, workspaceId, targetType: "campaign", targetId: c.id, summary: { before: { name: c.name, objective: c.objective, budgetAmount: c.budgetAmount }, after: n.values } });
    return { ok: "Campaign saved." };
  });
}

export async function setCampaignStatus(workspaceId: string, campaignId: string, status: string): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "campaigns.manage");
    if (!CAMPAIGN_STATUSES.includes(status as CampaignStatus)) return fail("Unknown status.");
    const c = await db.query.campaign.findFirst({ where: (x, { and, eq }) => and(eq(x.id, campaignId), eq(x.workspaceId, workspaceId)) });
    if (!c || c.archivedAt) return fail("Campaign not found.");
    await db.transaction(async (tx) => {
      await tx.update(campaign).set({ status: status as CampaignStatus, updatedAt: new Date() }).where(eq(campaign.id, c.id));
      await tx.insert(campaignEvent).values({ workspaceId, campaignId: c.id, kind: "status", actorUserId: ctx.session.user.id, data: { from: c.status, to: status } });
    });
    await audit({ action: "campaign.status", actorUserId: ctx.session.user.id, organizationId: c.organizationId, workspaceId, targetType: "campaign", targetId: c.id, summary: { before: c.status, after: status } });
    return { ok: `Campaign ${status === "active" ? "activated" : status}.` };
  });
}

/** Archiving hides the campaign; nothing is deleted, and paid objects stay linked for history. */
export async function archiveCampaign(workspaceId: string, campaignId: string, restore = false): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "campaigns.manage");
    const c = await db.query.campaign.findFirst({ where: (x, { and, eq }) => and(eq(x.id, campaignId), eq(x.workspaceId, workspaceId)) });
    if (!c) return fail("Campaign not found.");
    await db.transaction(async (tx) => {
      await tx.update(campaign).set({ archivedAt: restore ? null : new Date(), updatedAt: new Date() }).where(eq(campaign.id, c.id));
      await tx.insert(campaignEvent).values({ workspaceId, campaignId: c.id, kind: restore ? "restored" : "archived", actorUserId: ctx.session.user.id });
    });
    await audit({ action: restore ? "campaign.restore" : "campaign.archive", actorUserId: ctx.session.user.id, organizationId: c.organizationId, workspaceId, targetType: "campaign", targetId: c.id });
    return { ok: restore ? "Campaign restored." : "Campaign archived." };
  });
}
