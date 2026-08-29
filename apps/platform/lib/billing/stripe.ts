/*
 * Stripe client. The secret key is a server-side variable (never NEXT_PUBLIC),
 * so it cannot reach the browser; this module deliberately avoids the
 * `server-only` package because the usage-reporting worker imports it too.
 *
 * With STRIPE_SECRET_KEY unset every billing surface says so plainly and every
 * billing action declines — nothing degrades into a half-working checkout.
 */
import Stripe from "stripe";

export const BILLING_UNCONFIGURED = "Billing isn't configured for this deployment yet.";
export const BILLING_UNAVAILABLE = "Stripe couldn't be reached. Nothing was charged — try again in a moment.";

export const billingConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY);

let cached: Stripe | null = null;

/** Throws when unconfigured; call sites check `billingConfigured()` first. */
export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new BillingNotConfiguredError();
  cached ??= new Stripe(key, { appInfo: { name: "Make It Social", url: "https://make-it-social.com" } });
  return cached;
}

export class BillingNotConfiguredError extends Error {
  constructor() {
    super(BILLING_UNCONFIGURED);
    this.name = "BillingNotConfiguredError";
  }
}

/** Test seam: swap the client (and reset with `null`) without touching env. */
export function __setStripeForTests(client: Stripe | null) {
  cached = client;
}

/** Currencies Stripe holds without a minor unit; formatting must not divide by 100. */
const ZERO_DECIMAL = new Set(["bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf"]);

/**
 * A Stripe price rendered as money. The amount always comes from the price
 * object — we never restate a number the dashboard owns.
 */
export function formatAmount(minorUnits: number | null | undefined, currency: string, locale = "en-US"): string | null {
  if (minorUnits == null) return null;
  const code = currency.toLowerCase();
  const value = ZERO_DECIMAL.has(code) ? minorUnits : minorUnits / 100;
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: currency.toUpperCase() }).format(value);
  } catch {
    return `${value} ${currency.toUpperCase()}`;
  }
}

/** "$49.00 per workspace / month" — the term comes from the price's recurring interval. */
export function describePrice(price: Pick<Stripe.Price, "unit_amount" | "currency" | "recurring">): string | null {
  const amount = formatAmount(price.unit_amount, price.currency);
  if (!amount) return null;
  const interval = price.recurring?.interval;
  return interval ? `${amount} per workspace / ${interval}` : amount;
}
