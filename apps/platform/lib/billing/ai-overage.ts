/*
 * AI overage → Stripe billing meter.
 *
 * A workspace gets `includedAiCreditsPerWorkspace` free every billing period;
 * everything above that is reported to a Stripe meter, which the metered price
 * turns into money. Reported once: billing_usage_report holds the running
 * total per (subscription, workspace, period) and only the delta is sent, with
 * a deterministic identifier so a Stripe retry cannot double-charge.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { billingCustomer, billingSubscription, billingUsageReport } from "@/db/schema/billing";
import { log } from "@/lib/log";
import { creditsByWorkspace } from "./ai-credits";
import { aiCreditsMeterEvent, overagePriceId } from "./plans";
import { billingConfigured, stripe } from "./stripe";

type Sub = typeof billingSubscription.$inferSelect;

/** Whole credits above the allowance. A partial credit is not billed. */
export function overageCredits(used: number, allowance: number): number {
  return Math.max(0, Math.floor(used) - Math.max(0, allowance));
}

/** Stable per (subscription, workspace, period, running total) — safe to resend. */
export function meterIdentifier(subscriptionId: string, workspaceId: string, periodStart: Date, total: number): string {
  return `rke-${subscriptionId}-${workspaceId}-${periodStart.getTime()}-${total}`;
}

/** Statuses whose usage is still billable; a canceled subscription reports nothing further. */
const BILLABLE = ["active", "trialing", "past_due", "unpaid"] as const;

export type ReportSummary = { subscriptions: number; workspaces: number; credits: number };

/**
 * Nightly and at period end. Returns what was actually sent, so the worker log
 * says something true rather than "done".
 */
export async function reportAiOverage(now = new Date()): Promise<ReportSummary> {
  const summary: ReportSummary = { subscriptions: 0, workspaces: 0, credits: 0 };
  if (!billingConfigured() || !aiCreditsMeterEvent() || !overagePriceId()) return summary;

  const subs = await db.select().from(billingSubscription).where(inArray(billingSubscription.status, [...BILLABLE]));
  for (const sub of subs) {
    try {
      const sent = await reportSubscription(sub, now);
      summary.subscriptions += 1;
      summary.workspaces += sent.workspaces;
      summary.credits += sent.credits;
    } catch (err) {
      // One organization's meter failure must not stop the rest of the sweep.
      log.error("ai overage report failed", { organizationId: sub.organizationId, subscription: sub.id, err });
    }
  }
  return summary;
}

/** One subscription's period. Idempotent: only the delta since the last run is sent. */
export async function reportSubscription(sub: Sub, now: Date): Promise<{ workspaces: number; credits: number }> {
  const eventName = aiCreditsMeterEvent();
  const periodStart = sub.currentPeriodStart;
  if (!eventName || !periodStart) return { workspaces: 0, credits: 0 };
  const periodEnd = sub.currentPeriodEnd ?? now;
  const to = now < periodEnd ? now : periodEnd;

  const [customer] = await db.select().from(billingCustomer).where(eq(billingCustomer.organizationId, sub.organizationId));
  if (!customer) return { workspaces: 0, credits: 0 };

  const usage = await creditsByWorkspace(sub.organizationId, { from: periodStart, to });
  const prior = await db
    .select()
    .from(billingUsageReport)
    .where(and(eq(billingUsageReport.subscriptionId, sub.id), eq(billingUsageReport.periodStart, periodStart)));
  const reported = new Map(prior.map((r) => [r.workspaceId, r.credits]));

  let workspaces = 0;
  let credits = 0;
  for (const row of usage) {
    const total = overageCredits(row.credits, sub.includedAiCreditsPerWorkspace);
    const delta = total - (reported.get(row.workspaceId) ?? 0);
    if (delta <= 0) continue;
    const identifier = meterIdentifier(sub.id, row.workspaceId, periodStart, total);
    await stripe().billing.meterEvents.create({
      event_name: eventName,
      identifier,
      timestamp: Math.floor(now.getTime() / 1000),
      payload: { stripe_customer_id: customer.stripeCustomerId, value: String(delta) },
    });
    await recordReport({ sub, workspaceId: row.workspaceId, periodStart, periodEnd, total, identifier, now });
    workspaces += 1;
    credits += delta;
  }
  return { workspaces, credits };
}

async function recordReport(input: {
  sub: Sub;
  workspaceId: string;
  periodStart: Date;
  periodEnd: Date;
  total: number;
  identifier: string;
  now: Date;
}) {
  const values = {
    organizationId: input.sub.organizationId,
    subscriptionId: input.sub.id,
    workspaceId: input.workspaceId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    credits: input.total,
    stripeMeterEventId: input.identifier,
    reportedAt: input.now,
    updatedAt: input.now,
  };
  await db
    .insert(billingUsageReport)
    .values(values)
    .onConflictDoUpdate({
      target: [billingUsageReport.subscriptionId, billingUsageReport.workspaceId, billingUsageReport.periodStart],
      set: { credits: values.credits, stripeMeterEventId: values.stripeMeterEventId, reportedAt: values.reportedAt, updatedAt: values.updatedAt },
    });
}
