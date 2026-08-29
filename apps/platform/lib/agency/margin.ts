/*
 * Per-client cost and margin (M8.11). Pure: every input arrives already
 * measured, so the maths is testable without a database, Stripe, or a period.
 *
 * The rule from lib/tracking/availability.ts holds here too — a missing input
 * is never 0. Each amount is `{ cents, reason }`: a null amount carries the
 * sentence the UI shows instead of a number, and any total that depends on it
 * is null as well rather than quietly smaller than the truth.
 */
/** The vocabulary lives here, not in the schema, so client components can import it without pulling in Drizzle. */
export const BILLING_MODELS = ["retainer", "per_post", "hourly", "none"] as const;
export type ClientBillingModel = (typeof BILLING_MODELS)[number];

export type Money = { cents: number | null; reason: string | null };

export const money = (cents: number): Money => ({ cents: Math.round(cents), reason: null });
export const unknownMoney = (reason: string): Money => ({ cents: null, reason });
export const ZERO: Money = { cents: 0, reason: null };

export const BILLING_MODEL_LABELS: Record<ClientBillingModel, string> = {
  retainer: "Retainer",
  per_post: "Per post",
  hourly: "Hourly",
  none: "Not set",
};

export const NO_RATE = "No rate is set for this client. Use Set rate to record what you charge them.";
export const HOURS_NOT_TRACKED =
  "This client is billed hourly and RocketEase does not track hours, so revenue cannot be computed here. Record the retainer equivalent, or bill from your time-tracking tool.";
export const NO_PER_POST_RATE = "This client is billed per post but no per-post rate is set yet.";
export const MIXED_CURRENCY = "Clients here bill in different currencies, so a combined total would not mean anything. Totals are per currency.";

export type ClientRate = {
  billingModel: ClientBillingModel;
  currency: string;
  retainerCents: number;
  perPostCents: number | null;
  hourlyCents: number | null;
  adSpendMarkupBps: number | null;
  aiCreditMarkupBps: number | null;
  note: string;
};

export type MarginInput = {
  workspaceId: string;
  workspaceName: string;
  /** Currency of every amount on the row; the rate's currency wins when one is set. */
  currency: string;
  /** Organization subscription cost ÷ billed workspaces. */
  platformShare: Money;
  /** Metered AI above the included allowance × the overage price. */
  aiCost: Money;
  aiCreditsUsed: number | null;
  aiCreditsReason: string | null;
  /** Imported ad spend for the period; null when no ad account is connected. */
  adSpend: Money;
  postsPublished: number;
  conversationsHandled: number;
  rate: ClientRate | null;
};

export type MarginRow = {
  workspaceId: string;
  workspaceName: string;
  currency: string;
  billingModel: ClientBillingModel;
  billingLabel: string;
  postsPublished: number;
  conversationsHandled: number;
  aiCreditsUsed: number | null;
  aiCreditsReason: string | null;
  revenue: Money;
  platformShare: Money;
  aiCost: Money;
  adSpend: Money;
  /** Ad spend is a cost only when the agency buys the media (a markup is configured). */
  agencyPaysMedia: boolean;
  cost: Money;
  margin: Money;
  /** margin ÷ revenue, 0–1. Null whenever either side is unknown or revenue is 0. */
  marginPct: number | null;
  marginPctReason: string | null;
  note: string;
};

/** Sum that refuses to guess: one unknown part makes the whole unknown, with the reasons kept. */
export function addMoney(parts: Money[]): Money {
  const blocked = parts.filter((p) => p.cents === null).map((p) => p.reason).filter((r): r is string => Boolean(r));
  if (blocked.length) return { cents: null, reason: [...new Set(blocked)].join(" ") };
  return { cents: parts.reduce((n, p) => n + (p.cents ?? 0), 0), reason: null };
}

/** Basis points on top of an amount: 4_500 bps = +45%. A null markup means "not rebilled". */
export function withMarkup(base: Money, bps: number | null): Money {
  if (bps == null) return ZERO;
  if (base.cents === null) return base;
  return money(base.cents * (1 + bps / 10_000));
}

/** What the agency invoices this client for the period, before any rebilled pass-through. */
function baseRevenue(rate: ClientRate | null, postsPublished: number): Money {
  if (!rate || rate.billingModel === "none") return unknownMoney(NO_RATE);
  if (rate.billingModel === "retainer") return money(rate.retainerCents);
  if (rate.billingModel === "per_post") {
    return rate.perPostCents == null ? unknownMoney(NO_PER_POST_RATE) : money(rate.perPostCents * postsPublished);
  }
  return unknownMoney(HOURS_NOT_TRACKED);
}

/**
 * One client's economics for a period.
 * revenue = fee + rebilled ad spend + rebilled AI (each only where a markup says so)
 * cost    = platform share + AI cost + ad spend when the agency buys the media
 */
export function computeMargin(input: MarginInput): MarginRow {
  const rate = input.rate;
  const agencyPaysMedia = rate?.adSpendMarkupBps != null;
  const revenue = addMoney([
    baseRevenue(rate, input.postsPublished),
    withMarkup(input.adSpend, rate?.adSpendMarkupBps ?? null),
    withMarkup(input.aiCost, rate?.aiCreditMarkupBps ?? null),
  ]);
  const cost = addMoney([input.platformShare, input.aiCost, agencyPaysMedia ? input.adSpend : ZERO]);
  const margin =
    revenue.cents === null || cost.cents === null
      ? { cents: null, reason: [...new Set([revenue.reason, cost.reason].filter(Boolean) as string[])].join(" ") }
      : money(revenue.cents - cost.cents);
  return {
    workspaceId: input.workspaceId,
    workspaceName: input.workspaceName,
    currency: rate?.currency || input.currency,
    billingModel: rate?.billingModel ?? "none",
    billingLabel: BILLING_MODEL_LABELS[rate?.billingModel ?? "none"],
    postsPublished: input.postsPublished,
    conversationsHandled: input.conversationsHandled,
    aiCreditsUsed: input.aiCreditsUsed,
    aiCreditsReason: input.aiCreditsReason,
    revenue,
    platformShare: input.platformShare,
    aiCost: input.aiCost,
    adSpend: input.adSpend,
    agencyPaysMedia,
    cost,
    margin,
    ...marginShare(revenue, margin),
    note: rate?.note ?? "",
  };
}

function marginShare(revenue: Money, margin: Money): { marginPct: number | null; marginPctReason: string | null } {
  if (margin.cents === null) return { marginPct: null, marginPctReason: margin.reason };
  if (!revenue.cents) return { marginPct: null, marginPctReason: "Margin % needs revenue to divide by, and this client has none recorded for the period." };
  return { marginPct: margin.cents / revenue.cents, marginPctReason: null };
}

export type MarginTotals = {
  currency: string | null;
  clients: number;
  postsPublished: number;
  conversationsHandled: number;
  revenue: Money;
  platformShare: Money;
  aiCost: Money;
  adSpend: Money;
  cost: Money;
  margin: Money;
  marginPct: number | null;
  marginPctReason: string | null;
};

/**
 * Footer total. analytics.md forbids combining money across currencies, so a
 * mixed set totals nothing and says why instead of adding unlike numbers.
 */
export function marginTotals(rows: MarginRow[]): MarginTotals {
  const currencies = [...new Set(rows.map((r) => r.currency))];
  const mixed = currencies.length > 1;
  const pick = (get: (r: MarginRow) => Money): Money => (mixed ? unknownMoney(MIXED_CURRENCY) : addMoney(rows.map(get)));
  const revenue = pick((r) => r.revenue);
  const margin = pick((r) => r.margin);
  return {
    currency: mixed ? null : (currencies[0] ?? null),
    clients: rows.length,
    postsPublished: rows.reduce((n, r) => n + r.postsPublished, 0),
    conversationsHandled: rows.reduce((n, r) => n + r.conversationsHandled, 0),
    revenue,
    platformShare: pick((r) => r.platformShare),
    aiCost: pick((r) => r.aiCost),
    adSpend: pick((r) => r.adSpend),
    cost: pick((r) => r.cost),
    margin,
    ...marginShare(revenue, margin),
  };
}

/**
 * Minor units as money. Rates are stored at 1/100 of the currency unit — the
 * convention the rate form writes — so the same divisor always reads them back.
 */
export function formatMoney(cents: number, currency: string, locale = "en-US"): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

export const formatPct = (share: number) => {
  const pct = share * 100;
  return `${pct.toFixed(Math.abs(pct) < 10 ? 1 : 0)}%`;
};
