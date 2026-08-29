import type { Capabilities } from "@rocketease/providers/client";
import { formatInZone } from "@/lib/time";
import type { StatusTone } from "./types";

/** "5 mins ago" / "1 hr ago" / "2 days ago", then a date once it stops being useful. */
export function agoLabel(at: Date, tz: string, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now - at.getTime()) / 60_000));
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  if (days <= 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return formatInZone(at, tz, { month: "short", day: "numeric" });
}

export const stampLabel = (at: Date, tz: string) => formatInZone(at, tz, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export const CHANNEL_STATUS: Record<string, { label: string; tone: StatusTone; detail: string }> = {
  connecting: { label: "Connecting", tone: "info", detail: "Finishing sign-in" },
  syncing: { label: "Syncing", tone: "info", detail: "Reading accounts and permissions" },
  healthy: { label: "Healthy", tone: "success", detail: "All systems go" },
  degraded: { label: "Warning", tone: "warning", detail: "Some permissions limited" },
  action_required: { label: "Error", tone: "error", detail: "Needs attention" },
  revoked: { label: "Error", tone: "error", detail: "Access revoked at the network" },
  disconnected: { label: "Disconnected", tone: "neutral", detail: "No longer connected" },
};

/**
 * What this channel's grant covers, in the words the permissions column uses.
 * Derived from the channel's own stored capabilities — never assumed per network.
 */
export function channelAccess(caps: Capabilities, permissionsOk: boolean): { label: string; detail: string } {
  const parts: string[] = [];
  if (caps.formats.length) parts.push("Content");
  if (caps.insights.organic || caps.insights.audience) parts.push("Insights");
  if (caps.inbox.comments || caps.inbox.messages || caps.inbox.mentions || caps.inbox.reviews) parts.push("Messages");
  if (caps.ads.import || caps.ads.manage) parts.push("Ads");
  const label = !permissionsOk ? "Limited access" : caps.formats.length === 0 ? "Read-only" : "Full access";
  return { label, detail: parts.join(", ") || "Nothing granted" };
}

/** Days until a token expires; null when the provider says it does not expire. */
export function daysUntil(at: Date | null, now = Date.now()): number | null {
  if (!at) return null;
  return Math.ceil((at.getTime() - now) / 86_400_000);
}
