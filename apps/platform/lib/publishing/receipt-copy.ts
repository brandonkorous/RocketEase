/**
 * Publish-receipt wording. Every string here describes what we actually did —
 * no promises about the network's behaviour (docs/originals: never invent).
 */
import type { VariantError } from "@/db/schema/content";

export const NETWORK_LABEL: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  x: "X",
  youtube: "YouTube",
  pinterest: "Pinterest",
  google_business: "Google Business Profile",
  mock: "Demo network",
};

export const networkLabel = (network: string) => NETWORK_LABEL[network] ?? network;

/** "17895695668004550" → "1789…". Full id stays available for support. */
export const shortId = (id: string) => (id.length > 8 ? `${id.slice(0, 4)}…` : id);

/** Short opaque reference to the idempotency key; it is never a secret, but it is never useful in full either. */
export const shortKey = (key: string) => `${key.slice(0, 8)}…`;

/** What went wrong, in plain words, per provider ErrorCategory. */
const CAUSE: Record<string, string> = {
  temporary: "Network timed out",
  rate_limit: "Rate limit reached",
  permission: "The connection was rejected",
  validation: "The network rejected the content",
  policy: "The network blocked this post",
  deleted: "The destination no longer exists",
  stale_version: "A newer version replaced this one",
  approval: "Approval was no longer valid",
  unknown: "The network returned an unexpected error",
};

export const causeOf = (category: string) => CAUSE[category] ?? CAUSE.unknown;

/**
 * One factual sentence for a failure. Ambiguous results carry the reconciliation
 * promise, because that is exactly what the publish worker did.
 */
export function failureSummary(error: VariantError): string {
  const cause = causeOf(error.category);
  if (error.ambiguous) return `${cause} — we checked before retrying; no duplicate was sent.`;
  return `${cause} — ${error.message}`;
}

const NEXT_ACTION: Record<string, string> = {
  validation: "Fix the content, then schedule again.",
  policy: "Edit the post to fit the network's rules, then schedule again.",
  permission: "Reconnect this channel under Connected accounts, then retry.",
  deleted: "Choose a different destination, then schedule again.",
  rate_limit: "Retry later. We reuse the same idempotency key, so a retry cannot duplicate the post.",
  temporary: "Retry when you're ready. We reuse the same idempotency key, so a retry cannot duplicate the post.",
  stale_version: "Schedule the current version.",
  approval: "Request approval again, then schedule.",
};

export const nextActionFor = (category: string) =>
  NEXT_ACTION[category] ?? "Retry from this post. We ask the network what exists before sending again.";

export const OUTCOME_LABEL = {
  draft: "Draft",
  scheduled: "Scheduled",
  in_flight: "Publishing",
  confirmed: "Confirmed",
  retrying: "Retry scheduled",
  failed: "Not published",
  removed: "Removed at network",
  canceled: "Canceled",
} as const;
