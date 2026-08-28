/* Presentation helpers shared by campaign screens (server + client safe). */
import type { CampaignObjective, CampaignStatus } from "@/db/schema/campaigns";

export const OBJECTIVE_LABEL: Record<CampaignObjective, string> = { awareness: "Awareness", engagement: "Engagement", traffic: "Traffic", leads: "Leads", conversions: "Conversions" };
export const STATUS_LABEL: Record<CampaignStatus, string> = { draft: "Draft", active: "Active", paused: "Paused", completed: "Completed" };
export const STATUS_COLOR: Record<CampaignStatus, "neutral" | "success" | "warning" | "info"> = { draft: "neutral", active: "success", paused: "warning", completed: "info" };

export function formatMoney(amount: number | null | undefined, currency: string, opts: { compact?: boolean } = {}) {
  if (amount == null) return "—";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: opts.compact && amount >= 1000 ? 0 : 2, notation: opts.compact && amount >= 100_000 ? "compact" : "standard" }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export const dateLabel = (d: Date | null | undefined, tz: string) => (d ? new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric", year: "numeric" }).format(d) : null);

/** "May 12 – May 23, 2025 (12 days left)" — the header line from images/campaign-details.png. */
export function rangeLabel(start: Date | null, end: Date | null, tz: string, now = new Date()) {
  if (!start && !end) return "No dates set";
  const short = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(d);
  const base = start && end ? `${short(start)} – ${dateLabel(end, tz)}` : start ? `From ${dateLabel(start, tz)}` : `Until ${dateLabel(end!, tz)}`;
  if (!end) return base;
  const left = Math.ceil((end.getTime() - now.getTime()) / 86_400_000);
  return `${base} (${left > 0 ? `${left} day${left === 1 ? "" : "s"} left` : "ended"})`;
}

export const relative = (d: Date, tz: string) => new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(d);

export const PAID_STATUS_COLOR: Record<string, "neutral" | "success" | "warning" | "error" | "info"> = { active: "success", paused: "warning", in_review: "info", rejected: "error", archived: "neutral", deleted: "neutral", unknown: "neutral" };
export const PAID_STATUS_LABEL: Record<string, string> = { active: "Active", paused: "Paused", in_review: "In review", rejected: "Rejected", archived: "Archived", deleted: "Deleted", unknown: "Unknown" };

export const CAMPAIGN_TABS = [
  { key: "overview", label: "Overview" }, { key: "content", label: "Content" }, { key: "ads", label: "Ads" }, { key: "audience", label: "Audience" },
  { key: "conversations", label: "Conversations" }, { key: "performance", label: "Performance" }, { key: "activity", label: "Activity" },
] as const;
export type CampaignTab = (typeof CAMPAIGN_TABS)[number]["key"];
