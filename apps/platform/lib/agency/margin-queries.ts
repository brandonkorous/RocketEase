/*
 * Inputs for the agency Economics section: one month, one organization, the
 * client workspaces the caller can already see.
 *
 * Nothing here estimates. Ad spend is the imported paid `spend` facts and is
 * unknown when no ad account is connected; AI is the usage ledger; the
 * platform's own cost comes from the live Stripe price (margin-costs.ts).
 */
import "server-only";
import { and, eq, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { member } from "@/db/schema/auth";
import { clientRate } from "@/db/schema/agency";
import { metricFact } from "@/db/schema/analytics";
import { adAccount } from "@/db/schema/campaigns";
import { postVariant } from "@/db/schema/content";
import { conversation } from "@/db/schema/engagement";
import { usageByWorkspace } from "@/lib/ai/usage/export";
import { monthOf, monthWindow, type MonthWindow } from "@/lib/ai/usage/period";
import { dayKey } from "@/lib/time";
import { computeMargin, marginTotals, money, unknownMoney, type ClientRate, type MarginRow, type MarginTotals } from "./margin";
import { aiCost, platformCosts, type PlatformCosts } from "./margin-costs";

export const NO_AD_ACCOUNT = "No ad account is connected for this client, so ad spend is unknown. Connect one from a campaign's Ads tab.";

export type PeriodKey = "this" | "last";
export type AgencyPeriod = MonthWindow & { key: PeriodKey; label: string };

/** "This month" / "Last month" in the first client's timezone — the agency's working month. */
export function agencyPeriod(key: string | undefined, timezone: string, now = new Date()): AgencyPeriod {
  const k: PeriodKey = key === "last" ? "last" : "this";
  const current = monthOf(now, timezone);
  const [y, m] = current.split("-").map(Number);
  const month = k === "this" ? current : `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, "0")}`;
  const win = monthWindow(month, timezone);
  const label = new Date(`${month}-01T12:00:00Z`).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  return { ...win, key: k, label };
}

/** Client economics is commercial data: owners and admins of the organization only. */
export async function canSeeEconomics(organizationId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)));
  return ["owner", "admin"].includes(row?.role ?? "");
}

type Counts = Map<string, number>;
const toMap = (rows: { workspaceId: string; n: number }[]): Counts => new Map(rows.map((r) => [r.workspaceId, Number(r.n)]));

async function publishedCounts(ids: string[], period: MonthWindow): Promise<Counts> {
  const rows = await db
    .select({ workspaceId: postVariant.workspaceId, n: sql<number>`count(*)::int` })
    .from(postVariant)
    .where(and(inArray(postVariant.workspaceId, ids), eq(postVariant.status, "published"), gte(postVariant.publishedAt, period.from), lt(postVariant.publishedAt, period.to)))
    .groupBy(postVariant.workspaceId);
  return toMap(rows);
}

/** Handled = first replied to, or resolved, inside the period. Both are recorded on the conversation. */
async function handledCounts(ids: string[], period: MonthWindow): Promise<Counts> {
  const within = (col: typeof conversation.firstResponseAt) => and(gte(col, period.from), lt(col, period.to));
  const rows = await db
    .select({ workspaceId: conversation.workspaceId, n: sql<number>`count(*)::int` })
    .from(conversation)
    .where(and(inArray(conversation.workspaceId, ids), or(within(conversation.firstResponseAt), within(conversation.resolvedAt))))
    .groupBy(conversation.workspaceId);
  return toMap(rows);
}

/** Imported paid `spend` facts for the period, in the ad account's own currency. */
async function adSpendCents(ids: string[], period: MonthWindow, timezone: string): Promise<Map<string, number>> {
  const from = dayKey(period.from, timezone);
  const to = dayKey(new Date(period.to.getTime() - 1), timezone);
  const rows = await db
    .select({ workspaceId: metricFact.workspaceId, v: sql<number>`sum(${metricFact.value})::float` })
    .from(metricFact)
    .where(and(inArray(metricFact.workspaceId, ids), eq(metricFact.scope, "paid"), eq(metricFact.metric, "spend"), gte(metricFact.day, from), lte(metricFact.day, to)))
    .groupBy(metricFact.workspaceId);
  return new Map(rows.map((r) => [r.workspaceId, Math.round(Number(r.v) * 100)]));
}

/** Workspaces with a live ad account, and the currency it reports in. */
async function adAccounts(ids: string[]): Promise<Map<string, string>> {
  const rows = await db
    .select({ workspaceId: adAccount.workspaceId, currency: adAccount.currency })
    .from(adAccount)
    .where(and(inArray(adAccount.workspaceId, ids), isNull(adAccount.disconnectedAt)));
  return new Map(rows.map((r) => [r.workspaceId, r.currency.toUpperCase()]));
}

export async function clientRates(organizationId: string): Promise<Map<string, ClientRate>> {
  const rows = await db.select().from(clientRate).where(eq(clientRate.organizationId, organizationId));
  return new Map(rows.map((r) => [r.workspaceId, {
    billingModel: r.billingModel,
    currency: r.currency,
    retainerCents: r.retainerCents,
    perPostCents: r.perPostCents,
    hourlyCents: r.hourlyCents,
    adSpendMarkupBps: r.adSpendMarkupBps,
    aiCreditMarkupBps: r.aiCreditMarkupBps,
    note: r.note,
  }]));
}

export type Client = { id: string; name: string };
export type MarginReport = { rows: MarginRow[]; totals: MarginTotals; platform: PlatformCosts; period: AgencyPeriod; rates: Map<string, ClientRate> };

/** Everything the Economics table renders for one organization and one month. */
export async function marginReport(input: {
  organizationId: string;
  clients: Client[];
  period: AgencyPeriod;
  timezone: string;
}): Promise<MarginReport> {
  const ids = input.clients.map((c) => c.id);
  const empty = new Map<string, never>();
  const [platform, rates, usage, published, handled, spend, accounts] = await Promise.all([
    platformCosts(input.organizationId),
    clientRates(input.organizationId),
    ids.length ? usageByWorkspace(input.organizationId, input.period) : Promise.resolve([]),
    ids.length ? publishedCounts(ids, input.period) : Promise.resolve(empty as Counts),
    ids.length ? handledCounts(ids, input.period) : Promise.resolve(empty as Counts),
    ids.length ? adSpendCents(ids, input.period, input.timezone) : Promise.resolve(empty as Map<string, number>),
    ids.length ? adAccounts(ids) : Promise.resolve(empty as Map<string, string>),
  ]);
  const credits = new Map(usage.map((u) => [u.workspaceId, u.credits]));

  const rows = input.clients.map((c) => {
    // No ledger row means no AI was used — a real zero, not a missing input.
    const used = credits.get(c.id) ?? 0;
    const connected = accounts.has(c.id);
    return computeMargin({
      workspaceId: c.id,
      workspaceName: c.name,
      currency: accounts.get(c.id) ?? platform.currency,
      platformShare: platform.share,
      aiCost: aiCost(used, platform, null),
      aiCreditsUsed: used,
      aiCreditsReason: null,
      adSpend: connected ? money(spend.get(c.id) ?? 0) : unknownMoney(NO_AD_ACCOUNT),
      postsPublished: published.get(c.id) ?? 0,
      conversationsHandled: handled.get(c.id) ?? 0,
      rate: rates.get(c.id) ?? null,
    });
  });
  return { rows, totals: marginTotals(rows), platform, period: input.period, rates };
}
