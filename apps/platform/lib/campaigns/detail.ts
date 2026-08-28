import { notFound } from "next/navigation";
import { db } from "@/db";
import type { Campaign } from "@/db/schema/campaigns";
import { parseAnalyticsFilters, periodLabel, type AnalyticsFilters } from "@/lib/analytics/periods";
import { hasCapability, requireWorkspace } from "@/lib/session";
import { utcToZonedInput } from "@/lib/time";
import { loadAdsData, type AdsData } from "./ads";
import { paidAttribution, type PaidAttribution } from "./attribution";
import { rangeLabel } from "./format";
import { campaignPerformance, type CampaignPerformance } from "./performance";
import { listCampaigns, workspaceMembers, type CampaignListRow } from "./queries";
import { activityTab, audienceTab, contentTab, conversationsTab, type ActivityRow, type AttachableItem, type AudienceData, type CampaignConversationRow, type ContentRow } from "./tabs";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

import { CAMPAIGN_TABS, type CampaignTab } from "./format";
export { CAMPAIGN_TABS, type CampaignTab };

export type CampaignsListData = { workspaceId: string; rows: CampaignListRow[]; archived: boolean; members: { id: string; name: string }[]; canManage: boolean; canDraft: boolean; timezone: string; userId: string };

export async function loadCampaignsList(workspaceId: string, sp: Search): Promise<CampaignsListData> {
  const { workspace, session } = await requireWorkspace(workspaceId);
  const archived = one(sp.archived) === "1";
  const [rows, members] = await Promise.all([listCampaigns(workspaceId, workspace.timezone, archived), workspaceMembers(workspaceId)]);
  return { workspaceId, rows, archived, members, canManage: hasCapability(workspace, "campaigns.manage"), canDraft: hasCapability(workspace, "campaigns.draft"), timezone: workspace.timezone, userId: session.user.id };
}

/** Serializable campaign header + form values (local datetimes in the workspace timezone). */
export type CampaignHeader = {
  id: string; name: string; description: string; objective: Campaign["objective"]; status: Campaign["status"]; archived: boolean;
  startLocal: string; endLocal: string; startLabel: string | null; endLabel: string | null; range: string; owner: { id: string; name: string } | null;
  budgetAmount: number | null; currency: string; tracking: Campaign["tracking"]; tags: string[]; createdAt: string;
};

export type CampaignDetailData = {
  workspaceId: string; timezone: string; tab: CampaignTab; campaign: CampaignHeader; networks: string[]; contentCount: number;
  members: { id: string; name: string }[]; canManage: boolean; canDraft: boolean; filters: AnalyticsFilters; periodLabel: string;
  attribution: PaidAttribution | null; perf: CampaignPerformance | null; budget: { planned: number | null; spent: number; remaining: number | null; pct: number | null; dailyAverage: number | null };
  content: { rows: ContentRow[]; attachable: AttachableItem[] } | null; ads: AdsData | null; audience: AudienceData | null;
  conversations: CampaignConversationRow[] | null; activity: ActivityRow[] | null;
};

function header(c: Campaign, owner: { id: string; name: string } | null, tz: string): CampaignHeader {
  const label = (d: Date | null) => (d ? new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric", year: "numeric" }).format(d) : null);
  return { id: c.id, name: c.name, description: c.description, objective: c.objective, status: c.status, archived: !!c.archivedAt, startLocal: c.startAt ? utcToZonedInput(c.startAt, tz) : "", endLocal: c.endAt ? utcToZonedInput(c.endAt, tz) : "", startLabel: label(c.startAt), endLabel: label(c.endAt), range: rangeLabel(c.startAt, c.endAt, tz), owner, budgetAmount: c.budgetAmount ? Number(c.budgetAmount) : null, currency: c.currency, tracking: c.tracking, tags: c.tags, createdAt: label(c.createdAt) ?? "" };
}

/** Planned budget vs imported spend over the campaign's whole life (not the analytics period). */
async function budgetSummary(workspaceId: string, c: Campaign) {
  const life = await campaignPerformance(workspaceId, c.id, { preset: "custom", from: "2000-01-01", to: "2999-12-31", compare: "none", scope: "paid" }, []);
  const spent = life.paid.spend ?? 0;
  const planned = c.budgetAmount ? Number(c.budgetAmount) : null;
  const days = c.startAt ? Math.max(1, Math.ceil((Math.min(Date.now(), c.endAt?.getTime() ?? Date.now()) - c.startAt.getTime()) / 86_400_000)) : null;
  return { planned, spent, remaining: planned === null ? null : planned - spent, pct: planned ? Math.min(100, (spent / planned) * 100) : null, dailyAverage: days && spent ? spent / days : null };
}

export async function loadCampaignDetail(workspaceId: string, campaignId: string, sp: Search): Promise<CampaignDetailData> {
  const { workspace } = await requireWorkspace(workspaceId);
  const tz = workspace.timezone;
  const c = await db.query.campaign.findFirst({ where: (x, { and, eq }) => and(eq(x.id, campaignId), eq(x.workspaceId, workspaceId)) });
  if (!c) notFound();
  const tab = (CAMPAIGN_TABS.some((t) => t.key === one(sp.tab)) ? one(sp.tab) : "overview") as CampaignTab;
  const filters = parseAnalyticsFilters(sp, tz);
  const [members, attribution, list, budget, perf, content, ads, audience, conversations, activity] = await Promise.all([
    workspaceMembers(workspaceId),
    paidAttribution(workspaceId, tz),
    listCampaigns(workspaceId, tz, !!c.archivedAt),
    budgetSummary(workspaceId, c),
    tab === "overview" || tab === "performance" ? campaignPerformance(workspaceId, c.id, filters) : Promise.resolve(null),
    tab === "content" ? contentTab(workspaceId, c.id, tz) : Promise.resolve(null),
    tab === "ads" ? loadAdsData(workspaceId, c, filters, tz, { connect: one(sp.connect) === "1", showAll: one(sp.all) === "1" }) : Promise.resolve(null),
    tab === "audience" ? audienceTab(workspaceId, c.id, filters) : Promise.resolve(null),
    tab === "conversations" ? conversationsTab(workspaceId, c.id, tz) : Promise.resolve(null),
    tab === "activity" || tab === "overview" ? activityTab(c.id, tz) : Promise.resolve(null),
  ]);
  const row = list.find((r) => r.id === c.id);
  const owner = members.find((m) => m.id === c.ownerUserId) ?? null;
  return {
    workspaceId, timezone: tz, tab, campaign: header(c, owner, tz), networks: row?.networks ?? [], contentCount: row?.contentCount ?? 0, members,
    canManage: hasCapability(workspace, "campaigns.manage"), canDraft: hasCapability(workspace, "campaigns.draft"), filters, periodLabel: periodLabel(filters),
    attribution, perf, budget, content, ads, audience, conversations, activity: activity ? activity.slice(0, tab === "overview" ? 6 : 100) : null,
  };
}
