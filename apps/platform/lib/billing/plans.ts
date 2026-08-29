/*
 * Plan catalog. Every price, meter and trial length is a Stripe object named
 * by an environment variable — the repo never states an amount of money, so a
 * price change is a dashboard change, not a deploy.
 *
 * A plan whose price id is unset is simply not offered, the same rule the
 * publishing providers and tracking sources follow.
 */
export const PLAN_KEYS = ["workspace_monthly", "workspace_yearly"] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

export type Plan = {
  key: PlanKey;
  label: string;
  /** How the term reads next to the price ("per workspace / month"). */
  interval: "month" | "year";
  priceId: string;
};

const PRICE_ENV: Record<PlanKey, string> = {
  workspace_monthly: "STRIPE_PRICE_WORKSPACE_MONTHLY",
  workspace_yearly: "STRIPE_PRICE_WORKSPACE_YEARLY",
};

const LABEL: Record<PlanKey, string> = { workspace_monthly: "Monthly", workspace_yearly: "Yearly" };
const INTERVAL: Record<PlanKey, Plan["interval"]> = { workspace_monthly: "month", workspace_yearly: "year" };

/** Every plan that has a configured Stripe price, in offer order. */
export function plans(): Plan[] {
  return PLAN_KEYS.flatMap((key) => {
    const priceId = process.env[PRICE_ENV[key]]?.trim();
    return priceId ? [{ key, label: LABEL[key], interval: INTERVAL[key], priceId }] : [];
  });
}

export const planByKey = (key: string): Plan | undefined => plans().find((p) => p.key === key);

/** Reverse lookup used when syncing a subscription back from Stripe. */
export const planByPriceId = (priceId: string): Plan | undefined => plans().find((p) => p.priceId === priceId);

/** The metered AI-overage price added beside the flat plan, when configured. */
export const overagePriceId = () => process.env.STRIPE_PRICE_AI_CREDIT_OVERAGE?.trim() || null;

/** Stripe billing meter event name that the overage price meters. */
export const aiCreditsMeterEvent = () => process.env.STRIPE_METER_AI_CREDITS?.trim() || null;

const int = (raw: string | undefined, fallback: number) => {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export const DEFAULT_INCLUDED_AI_CREDITS = 200;
export const DEFAULT_TRIAL_DAYS = 14;

/** AI credits included with each billed workspace every period. */
export const includedAiCredits = () => int(process.env.BILLING_INCLUDED_AI_CREDITS, DEFAULT_INCLUDED_AI_CREDITS);

/** Free trial length applied to a new subscription; 0 disables the trial. */
export const trialDays = () => int(process.env.BILLING_TRIAL_DAYS, DEFAULT_TRIAL_DAYS);

/** Days of continued publishing after a failed payment before new scheduling stops. */
export const GRACE_DAYS = 7;

/*
 * Credits are the AI ledger's own unit (lib/ai/usage/credits.ts): 1 credit =
 * 1,000 output tokens, input at a fifth. Re-exported so billing never restates
 * the conversion.
 */
export { creditsFor, formatCredits, INPUT_TOKENS_PER_CREDIT, OUTPUT_TOKENS_PER_CREDIT } from "@/lib/ai/usage/credits";
