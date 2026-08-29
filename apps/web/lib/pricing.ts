/*
 * Prices are never stated in the repo — the platform's plan catalog names Stripe
 * price objects by env var for the same reason. The marketing site reads display
 * amounts from build-time env so a price change is a config change.
 *
 * NEXT_PUBLIC_* is baked at build time (see deploy/README.md): these are Docker
 * build args, never ConfigMap values. Unset simply renders the "talk to us" path.
 */

export const INCLUDED_AI_CREDITS = 200;
export const TRIAL_DAYS = 14;

export type PriceDisplay = { amount: string | null; interval: "month" | "year"; note: string };

const amount = (raw: string | undefined) => {
  const value = raw?.trim();
  return value && /^[0-9]+(\.[0-9]{1,2})?$/.test(value) ? value : null;
};

export const MONTHLY: PriceDisplay = {
  amount: amount(process.env.NEXT_PUBLIC_PRICE_MONTHLY),
  interval: "month",
  note: "per workspace, billed monthly",
};

export const YEARLY: PriceDisplay = {
  amount: amount(process.env.NEXT_PUBLIC_PRICE_YEARLY),
  interval: "year",
  note: "per workspace, billed yearly",
};

export const PRICES_CONFIGURED = MONTHLY.amount !== null || YEARLY.amount !== null;

export const INCLUDED = [
  "Every feature — there is no tier that withholds the inbox or the analytics",
  "Unlimited connected channels per workspace",
  "Unlimited team members and roles",
  `${INCLUDED_AI_CREDITS} AI credits per workspace, per billing period`,
  "Approvals, campaigns, brand hub, content library and reports",
  "SAML single sign-on and SCIM provisioning",
  "Append-only audit log",
  "Agency overview and per-client economics",
];

export const METERED = [
  { label: "AI credits beyond the included allowance", detail: "Metered and billed in arrears. Your usage ledger shows every generation and its cost as it happens." },
  { label: "Additional workspaces", detail: "Each brand or client is its own workspace and is billed at the same rate." },
  { label: "Ad spend", detail: "Paid directly to the network on your own payment method. We never bill it, and we never take a percentage of it." },
];
