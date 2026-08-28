import type { ConversationDetailData } from "@/lib/engagement/detail";
import type { ConversationRow, InboxFilters, InboxStats, InboxTab } from "@/lib/engagement/queries";

export type Agent = { userId: string; name: string; image: string | null; role: string };
export type InboxChannel = { id: string; name: string; network: string; provider: string };

export type InboxScreenData = {
  workspaceId: string;
  userId: string;
  timezone: string;
  filters: InboxFilters;
  counts: Record<InboxTab, number>;
  rows: ConversationRow[];
  stats: InboxStats;
  agents: Agent[];
  channels: InboxChannel[];
  detail: ConversationDetailData | null;
  canHandle: boolean;
  /** Mock channels usable by the dev-only "simulate incoming" tool. */
  devChannels: InboxChannel[];
};

export type Nav = (patch: Record<string, string | null>) => void;

export const TABS: { key: InboxTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "mentions", label: "Mentions" },
  { key: "dms", label: "DMs" },
  { key: "comments", label: "Comments" },
];

export const STATUS_BADGE: Record<string, { label: string; color: "success" | "warning" | "neutral" | "info" }> = {
  open: { label: "Open", color: "info" },
  snoozed: { label: "Snoozed", color: "warning" },
  resolved: { label: "Resolved", color: "success" },
};

export const DELIVERY_LABEL: Record<string, string> = { queued: "Sending…", sending: "Sending…", sent: "Sent", ambiguous: "Confirming delivery…", failed: "Failed" };
