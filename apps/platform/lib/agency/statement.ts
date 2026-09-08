/*
 * Client statements (M14.10): one month's charges for one client, as the
 * lines an invoice carries. Built from the same inputs and rules as the
 * Economics row, so a statement and the margin table never disagree. A line
 * whose input is unknown blocks the whole statement with the reason: a
 * statement missing a part is wrong, not merely smaller. Pure.
 */
import { baseRevenue, formatMoney, withMarkup, type MarginInput } from "./margin";

/** Stripe's invoice states, mirrored: draft (ours, not sent), open → "sent", paid, void, uncollectible. */
export const STATEMENT_STATUSES = ["draft", "sent", "paid", "void", "uncollectible"] as const;
export type StatementStatus = (typeof STATEMENT_STATUSES)[number];
export const STATEMENT_STATUS_LABEL: Record<StatementStatus, string> = { draft: "Not sent", sent: "Sent", paid: "Paid", void: "Void", uncollectible: "Uncollectible" };

export type StatementLine = { kind: "fee" | "ad_spend" | "ai"; description: string; quantity: number; unitCents: number; cents: number };
export type StatementDraft = { currency: string; lines: StatementLine[]; totalCents: number };
export type StatementBuild = { ok: true; draft: StatementDraft } | { ok: false; blocked: string };

export const NOTHING_TO_BILL = "Nothing to bill for this period: every line is zero.";
export const NO_BILLING_EMAIL = "This client has no billing email. Add one under Set rate.";
export const NO_STRIPE = "Connect the agency's Stripe account first; statements go out as invoices from it.";
export const ALREADY_SENT = "A statement for this month has already been sent. Void it in Stripe before sending another.";
export const AD_SPEND_CURRENCY = "Ad spend is reported in a different currency from this client's rate, so it cannot be rebilled on the same invoice.";

const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;

/** Stripe invoice status → ours. `open` is what a sent, unpaid invoice is called there. */
export function statusFromInvoice(status: string | null | undefined): StatementStatus {
  if (status === "paid") return "paid";
  if (status === "void") return "void";
  if (status === "uncollectible") return "uncollectible";
  if (status === "open") return "sent";
  return "draft";
}

/**
 * The lines for one client and one month, in the rate's currency:
 * the fee (retainer, or per-post × published), then rebilled ad spend and AI
 * where the rate says so, each at its markup. A zero line is left out.
 */
export function buildStatement(input: MarginInput, periodLabel: string): StatementBuild {
  const rate = input.rate;
  const fee = baseRevenue(rate, input.postsPublished);
  if (!rate || fee.cents === null) return { ok: false, blocked: fee.reason ?? "No rate is set for this client." };
  const lines: StatementLine[] = [];
  if (rate.billingModel === "retainer") lines.push({ kind: "fee", description: `Retainer — ${periodLabel}`, quantity: 1, unitCents: rate.retainerCents, cents: fee.cents });
  else if (fee.cents > 0) lines.push({ kind: "fee", description: `Published posts — ${periodLabel} (${input.postsPublished} × ${formatMoney(rate.perPostCents ?? 0, rate.currency)})`, quantity: input.postsPublished, unitCents: rate.perPostCents ?? 0, cents: fee.cents });

  if (rate.adSpendMarkupBps != null) {
    if (input.adSpend.cents === null) return { ok: false, blocked: input.adSpend.reason ?? "Ad spend is unknown." };
    if (input.adSpend.cents > 0 && input.currency.toUpperCase() !== rate.currency.toUpperCase()) return { ok: false, blocked: AD_SPEND_CURRENCY };
    const rebilled = withMarkup(input.adSpend, rate.adSpendMarkupBps);
    if ((rebilled.cents ?? 0) > 0) lines.push({ kind: "ad_spend", description: `Ad spend rebilled at +${pct(rate.adSpendMarkupBps)} — ${periodLabel}`, quantity: 1, unitCents: rebilled.cents!, cents: rebilled.cents! });
  }
  if (rate.aiCreditMarkupBps != null) {
    if (input.aiCost.cents === null) return { ok: false, blocked: input.aiCost.reason ?? "AI cost is unknown." };
    const rebilled = withMarkup(input.aiCost, rate.aiCreditMarkupBps);
    if ((rebilled.cents ?? 0) > 0) lines.push({ kind: "ai", description: `AI usage rebilled at +${pct(rate.aiCreditMarkupBps)} — ${input.aiCreditsUsed ?? 0} credits, ${periodLabel}`, quantity: 1, unitCents: rebilled.cents!, cents: rebilled.cents! });
  }
  const totalCents = lines.reduce((n, l) => n + l.cents, 0);
  if (totalCents <= 0) return { ok: false, blocked: NOTHING_TO_BILL };
  return { ok: true, draft: { currency: rate.currency.toUpperCase(), lines, totalCents } };
}
