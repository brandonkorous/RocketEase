/*
 * Everything Settings → Billing renders. Read-only and organization-scoped;
 * the caller has already proved workspace membership, and owner/admin decides
 * whether the manage controls appear at all.
 */
import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { member } from "@/db/schema/auth";
import { billingSubscription } from "@/db/schema/billing";
import { currentMonthWindow } from "@/lib/ai/usage/period";
import { usageByWorkspace } from "@/lib/ai/usage/export";
import { formatInZone } from "@/lib/time";
import { activeWorkspaceCount, customerForOrg } from "./customer";
import { entitlements, type Entitlements } from "./entitlements";
import { includedAiCredits, plans } from "./plans";
import { billingConfigured, describePrice, formatAmount, stripe } from "./stripe";
import { statusLabel } from "./view";

export type PlanOffer = { key: string; label: string; priceLabel: string | null };
export type InvoiceRow = { id: string; number: string | null; date: string; amount: string | null; status: string; url: string | null };
export type WorkspaceCreditRow = { workspaceId: string; name: string; included: number; used: number; overage: number };

export type BillingData = {
  configured: boolean;
  canManage: boolean;
  organizationName: string;
  entitlements: Entitlements;
  statusLabel: string;
  gracefulUntil: string | null;
  renewsOn: string | null;
  trialEndsOn: string | null;
  cancelsOn: string | null;
  workspaceQuantity: number;
  activeWorkspaces: number;
  planLabel: string | null;
  planPrice: string | null;
  offers: PlanOffer[];
  invoices: InvoiceRow[];
  periodLabel: string | null;
  workspaceCredits: WorkspaceCreditRow[];
  /** Set when Stripe was unreachable; the page says so instead of showing nothing. */
  stripeError: boolean;
};

const day = (d: Date | null, tz: string) => (d ? formatInZone(d, tz, { dateStyle: "medium" }) : null);

/** Owner/admin of the organization — billing is theirs alone (permissions.md). */
async function canManageBilling(organizationId: string, userId: string) {
  const [row] = await db.select({ role: member.role }).from(member).where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)));
  return ["owner", "admin"].includes(row?.role ?? "");
}

/** Per-workspace AI credits for the billing period (or the calendar month before one exists). */
async function creditRows(organizationId: string, sub: typeof billingSubscription.$inferSelect | null, timezone: string) {
  const period = sub?.currentPeriodStart
    ? { from: sub.currentPeriodStart, to: sub.currentPeriodEnd ?? new Date() }
    : currentMonthWindow(timezone);
  const included = sub?.includedAiCreditsPerWorkspace || includedAiCredits();
  const usage = await usageByWorkspace(organizationId, period);
  return {
    period,
    workspaceCredits: usage.map((u) => ({
      workspaceId: u.workspaceId,
      name: u.workspaceName,
      included,
      used: u.credits,
      overage: Math.max(0, Math.floor(u.credits) - included),
    })),
  };
}

export async function billingData(ctx: { organizationId: string; organizationName: string; userId: string; timezone: string }): Promise<BillingData> {
  const { organizationId, timezone } = ctx;
  const configured = billingConfigured();
  const [ent, canManage, activeWorkspaces, [sub]] = await Promise.all([
    entitlements(organizationId),
    canManageBilling(organizationId, ctx.userId),
    activeWorkspaceCount(organizationId),
    db.select().from(billingSubscription).where(eq(billingSubscription.organizationId, organizationId)),
  ]);

  const { period, workspaceCredits } = await creditRows(organizationId, sub ?? null, timezone);

  const base: BillingData = {
    configured,
    canManage,
    organizationName: ctx.organizationName,
    entitlements: ent,
    statusLabel: sub ? statusLabel(sub.status) : "No subscription",
    gracefulUntil: day(ent.gracefulUntil, timezone),
    renewsOn: day(sub?.currentPeriodEnd ?? null, timezone),
    trialEndsOn: day(sub?.trialEnd ?? null, timezone),
    cancelsOn: day(sub?.cancelAt ?? null, timezone),
    workspaceQuantity: sub?.workspaceQuantity ?? activeWorkspaces,
    activeWorkspaces,
    planLabel: null,
    planPrice: null,
    offers: [],
    invoices: [],
    periodLabel: sub?.currentPeriodStart ? `${day(sub.currentPeriodStart, timezone)} – ${day(period.to, timezone)}` : null,
    workspaceCredits,
    stripeError: false,
  };
  if (!configured || !canManage) return base;

  try {
    const [offers, invoices] = await Promise.all([planOffers(), recentInvoices(organizationId)]);
    const current = sub ? offers.find((o) => o.key === sub.plan) : undefined;
    return { ...base, offers, invoices, planLabel: current?.label ?? null, planPrice: current?.priceLabel ?? null };
  } catch {
    return { ...base, stripeError: true };
  }
}

/** Each configured plan with its price read from Stripe — never from the repo. */
async function planOffers(): Promise<PlanOffer[]> {
  const list = plans();
  const prices = await Promise.all(list.map((p) => stripe().prices.retrieve(p.priceId)));
  return list.map((p, i) => ({ key: p.key, label: p.label, priceLabel: describePrice(prices[i]) }));
}

/** The last 12 invoices Stripe holds for this organization's customer. */
async function recentInvoices(organizationId: string): Promise<InvoiceRow[]> {
  const customer = await customerForOrg(organizationId);
  if (!customer) return [];
  const list = await stripe().invoices.list({ customer: customer.stripeCustomerId, limit: 12 });
  return list.data.map((inv) => ({
    id: inv.id ?? inv.number ?? String(inv.created),
    number: inv.number,
    date: new Date(inv.created * 1000).toISOString(),
    amount: formatAmount(inv.total, inv.currency),
    status: inv.status ?? "draft",
    url: inv.hosted_invoice_url ?? inv.invoice_pdf ?? null,
  }));
}

export const EMPTY_BILLING: BillingData = {
  configured: false,
  canManage: false,
  organizationName: "",
  entitlements: { state: "unconfigured", active: true, trialing: false, inGrace: false, gracefulUntil: null, workspacesAllowed: null, aiCreditsPerWorkspace: 0 },
  statusLabel: "No subscription",
  gracefulUntil: null,
  renewsOn: null,
  trialEndsOn: null,
  cancelsOn: null,
  workspaceQuantity: 0,
  activeWorkspaces: 0,
  planLabel: null,
  planPrice: null,
  offers: [],
  invoices: [],
  periodLabel: null,
  workspaceCredits: [],
  stripeError: false,
};
