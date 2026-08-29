"use server";

import { randomUUID } from "node:crypto";
import type { PromotionRequest } from "@rocketease/providers";
import { db } from "@/db";
import { campaignEvent, promotion } from "@/db/schema/campaigns";
import { totals } from "@/lib/analytics/queries";
import { audit } from "@/lib/audit";
import { emit } from "@/lib/jobs/outbox";
import { getAdapter } from "@/lib/providers";
import { requireCapability } from "@/lib/session";
import { hasFreshStepUp } from "@/lib/step-up";
import { promotionRightsIssue } from "@/lib/rights/promotion";
import { zonedToUtc } from "@/lib/time";
import { fail, guard, type ActionState } from "../content/shared";

export type PromoteInput = {
  campaignId: string | null;
  variantId: string;
  adAccountId: string;
  name: string;
  objective: PromotionRequest["objective"];
  budgetKind: "daily" | "lifetime";
  amount: number;
  /** Local datetimes in the workspace timezone. */
  startAt: string;
  endAt: string;
  countries: string;
  initialStatus: "paused" | "active";
  /** Must be true: the user saw the summary (source, destination, budget, dates, tracking) and confirmed it. */
  confirmed: boolean;
};

const MAX_AMOUNT = 100_000;
const DAY = 86_400_000;
const OBJECTIVES: PromotionRequest["objective"][] = ["engagement", "traffic", "awareness", "leads", "conversions"];

async function loadTargets(workspaceId: string, input: PromoteInput) {
  const variant = await db.query.postVariant.findFirst({ where: (v, { and, eq }) => and(eq(v.id, input.variantId), eq(v.workspaceId, workspaceId)) });
  const item = variant && (await db.query.contentItem.findFirst({ where: (i, { eq }) => eq(i.id, variant.contentItemId) }));
  const ch = variant && (await db.query.channel.findFirst({ where: (c, { eq }) => eq(c.id, variant.channelId) }));
  const account = await db.query.adAccount.findFirst({ where: (a, { and, eq, isNull }) => and(eq(a.id, input.adAccountId), eq(a.workspaceId, workspaceId), isNull(a.disconnectedAt)) });
  const conn = account && (await db.query.providerConnection.findFirst({ where: (c, { eq }) => eq(c.id, account.connectionId) }));
  const campaign = input.campaignId ? await db.query.campaign.findFirst({ where: (c, { and, eq }) => and(eq(c.id, input.campaignId!), eq(c.workspaceId, workspaceId)) }) : null;
  return { variant, item, ch, account, conn, campaign };
}

/** Budget policy: the estimated total must fit the campaign's remaining planned budget when one is set. */
async function budgetIssue(workspaceId: string, campaignId: string | null, planned: number | null, currency: string, est: number, accountCurrency: string) {
  if (!campaignId || planned === null) return null;
  if (currency !== accountCurrency) return `The campaign budget is in ${currency} but the ad account bills in ${accountCurrency}. Align currencies before promoting.`;
  const spent = (await totals(workspaceId, { from: "2000-01-01", to: "2999-12-31", compare: "none", scope: "paid", campaignId }, { from: "2000-01-01", to: "2999-12-31" })).spend ?? 0;
  const remaining = planned - spent;
  return est > remaining ? `This promotion would spend about ${est.toFixed(2)} ${currency}, more than the campaign's remaining budget (${remaining.toFixed(2)} ${currency}). Lower the budget or raise the campaign budget.` : null;
}

type Targets = Awaited<ReturnType<typeof loadTargets>>;

/** Everything that must hold before we even ask for a re-authentication. */
function eligibilityIssue({ variant, item, ch, account, conn }: Targets, input: PromoteInput): string | null {
  if (!variant || !item || !ch) return "Post not found.";
  if (variant.status !== "published" || !variant.remoteId) return "Only published posts can be promoted.";
  if (!["healthy", "degraded"].includes(ch.status)) return "Reconnect this channel before promoting.";
  if (!ch.capabilities.ads.manage) return ch.capabilities.reasons?.ads ?? `${ch.name} does not allow promotions from RocketEase.`;
  if (!account || !conn || conn.status !== "active") return "Pick a connected ad account.";
  if (account.provider !== ch.provider) return "The ad account must belong to the same network as the post.";
  if (!getAdapter(conn.provider).promote) return "This network only supports read-only ad import.";
  if (!OBJECTIVES.includes(input.objective)) return "Pick an objective.";
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) return `Budget must be between 0 and ${MAX_AMOUNT.toLocaleString()} ${account.currency}.`;
  return null;
}

/** Flight window in UTC, or the reason it is not usable. */
function flight(input: PromoteInput, timezone: string): { startAt: Date; endAt: Date | null } | string {
  const startAt = input.startAt ? zonedToUtc(input.startAt, timezone) : new Date();
  const endAt = input.endAt ? zonedToUtc(input.endAt, timezone) : null;
  if (endAt && endAt <= startAt) return "End must be after start.";
  if (input.budgetKind === "lifetime" && !endAt) return "A lifetime budget needs an end date.";
  return { startAt, endAt };
}

function buildRequest(t: Targets, input: PromoteInput, w: { startAt: Date; endAt: Date | null }): Omit<PromotionRequest, "idempotencyKey"> {
  const { variant, item, ch, account, campaign } = t;
  const countries = input.countries.split(/[,\s]+/).map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c));
  return {
    name: input.name.trim() || `${item!.title} · boost`,
    objective: input.objective,
    sourcePostRemoteId: variant!.remoteId!,
    channelRemoteId: ch!.remoteId,
    budget: { kind: input.budgetKind, amount: Number(input.amount), currency: account!.currency },
    startAt: w.startAt.toISOString(),
    endAt: w.endAt?.toISOString(),
    audience: countries.length ? { countries } : undefined,
    link: variant!.linkOverride ?? item!.link ?? undefined,
    tracking: campaign ? { utmSource: campaign.tracking.utmSource, utmMedium: campaign.tracking.utmMedium, utmCampaign: campaign.tracking.utmCampaign } : undefined,
    initialStatus: input.initialStatus === "active" ? "active" : "paused",
  };
}

/**
 * CAM-002: never spends without an explicit confirmation. Eligibility, rights
 * clocks, policy and budget all clear before the identity check; the worker
 * only executes what was confirmed.
 */
export async function promoteVariant(workspaceId: string, input: PromoteInput): Promise<ActionState & { promotionId?: string; stepUpRequired?: true }> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "campaigns.manage");
    if (input.confirmed !== true) return fail("Review the summary and confirm before promoting.");
    const t = await loadTargets(workspaceId, input);
    const bad = eligibilityIssue(t, input);
    if (bad) return fail(bad);
    const w = flight(input, ctx.workspace.timezone);
    if (typeof w === "string") return fail(w);
    const { variant, item, ch, account, campaign } = t;
    // M8.4: paid usage clocks must outlast the flight — checked before we ask for identity.
    const rights = await promotionRightsIssue(workspaceId, { item: item!, variant: variant!, channelId: ch!.id, timezone: ctx.workspace.timezone }, w);
    if (rights) return fail(rights);
    const days = w.endAt ? Math.max(1, Math.ceil((w.endAt.getTime() - w.startAt.getTime()) / DAY)) : 7;
    const est = input.budgetKind === "daily" ? Number(input.amount) * days : Number(input.amount);
    const issue = await budgetIssue(workspaceId, campaign?.id ?? null, campaign?.budgetAmount ? Number(campaign.budgetAmount) : null, campaign?.currency ?? account!.currency, est, account!.currency);
    if (issue) return fail(issue);
    // NFR-001: paid spend needs a recent re-authentication on this session.
    if (!(await hasFreshStepUp(ctx.session.session.id, "paid_spend"))) return { ...fail("Confirm your identity before creating ads."), stepUpRequired: true as const };
    const request = buildRequest(t, input, w);
    const promotionId = await db.transaction(async (tx) => {
      const [row] = await tx.insert(promotion).values({ organizationId: ctx.workspace.organizationId, workspaceId, campaignId: campaign?.id ?? null, variantId: variant!.id, channelId: ch!.id, adAccountId: account!.id, idempotencyKey: randomUUID(), request, confirmedByUserId: ctx.session.user.id }).returning({ id: promotion.id });
      if (campaign) await tx.insert(campaignEvent).values({ workspaceId, campaignId: campaign.id, kind: "promotion_confirmed", actorUserId: ctx.session.user.id, data: { promotionId: row.id, name: request.name, budget: request.budget, estimatedTotal: est, adAccount: account!.name } });
      await emit(tx, "promotion.execute", { promotionId: row.id }, { organizationId: ctx.workspace.organizationId, workspaceId, dedupeKey: `promotion.execute:${row.id}` });
      return row.id;
    });
    await audit({ action: "promotion.confirm", actorUserId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId, targetType: "promotion", targetId: promotionId, summary: { after: { ...request, estimatedTotal: est, adAccountId: account!.id, variantId: variant!.id, campaignId: campaign?.id ?? null } } });
    return { ok: `Promotion confirmed. Creating it in ${account!.name} (${request.initialStatus}).`, promotionId };
  });
}
