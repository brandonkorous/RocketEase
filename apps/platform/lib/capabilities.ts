/*
 * Capability presentation: labels and orderings shared by the public
 * capability page and the in-app "why not" lists. The truth itself always
 * comes from @rocketease/providers (CAPABILITY_CATALOG for a network,
 * the channel's own stored capabilities for a connected account).
 */
import type { Capabilities, CapabilityPath } from "@rocketease/providers/client";
import { capabilitySupported, reasonFor } from "@rocketease/providers/client";
import type { CapabilityItem } from "@/components/shared/why-not";

export const CAPABILITY_COLUMNS: { path: CapabilityPath; label: string; group: string }[] = [
  { path: "limits.firstComment", label: "First comment", group: "Publishing" },
  { path: "limits.altText", label: "Alt text", group: "Publishing" },
  { path: "disclosure", label: "AI disclosure", group: "Publishing" },
  { path: "cover", label: "Cover frame", group: "Publishing" },
  { path: "inbox.comments", label: "Comments", group: "Inbox" },
  { path: "inbox.mentions", label: "Mentions", group: "Inbox" },
  { path: "inbox.messages", label: "Messages", group: "Inbox" },
  { path: "inbox.reviews", label: "Reviews", group: "Inbox" },
  { path: "inbox.reply", label: "Reply from inbox", group: "Inbox" },
  { path: "insights.organic", label: "Post insights", group: "Measure" },
  { path: "insights.audience", label: "Audience insights", group: "Measure" },
  { path: "ads.import", label: "Ads import", group: "Ads" },
  { path: "ads.manage", label: "Ads manage", group: "Ads" },
  { path: "ingestion.webhooks", label: "Webhooks", group: "Delivery" },
];

export const CAPABILITY_LABELS: Partial<Record<CapabilityPath, string>> = {
  formats: "Publishing",
  scheduling: "Scheduling",
  "limits.links": "Links",
  "ingestion.polling": "Polling",
  ...Object.fromEntries(CAPABILITY_COLUMNS.map((c) => [c.path, c.label])),
};

/** What a connected channel's detail row lists; ordered by how often it matters. */
const CHANNEL_PATHS: CapabilityPath[] = [
  "inbox.comments",
  "inbox.messages",
  "inbox.reply",
  "insights.organic",
  "insights.audience",
  "limits.firstComment",
  "limits.altText",
  "disclosure",
  "cover",
  "ads.manage",
  "ingestion.webhooks",
];

/** One item per capability, each unsupported one carrying the network's own reason. */
export function channelCapabilityItems(caps: Capabilities): CapabilityItem[] {
  return CHANNEL_PATHS.map((path) => ({
    label: CAPABILITY_LABELS[path] ?? path,
    ok: capabilitySupported(caps, path),
    reason: reasonFor(caps, path) ?? null,
  }));
}
