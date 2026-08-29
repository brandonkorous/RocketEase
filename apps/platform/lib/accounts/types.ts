/*
 * What the Connected accounts screen renders (images/connected-accounts.png):
 * every integration — social channel, ad account, conversion source — reduced
 * to the same row shape so one list can show all three groups.
 */
import type { ChannelQuota } from "@/lib/channel-quota";
import type { CapabilityItem } from "@/components/shared/why-not";

export type AccountGroup = "social" | "ads" | "analytics";
export type StatusTone = "success" | "warning" | "error" | "neutral" | "info";

export const GROUP_LABEL: Record<AccountGroup, string> = {
  social: "Social accounts",
  ads: "Ad accounts",
  analytics: "Analytics",
};

export type RowAction = { label: string; href: string | null; emphasis: boolean };

export type IntegrationRow = {
  id: string;
  group: AccountGroup;
  /** Drives NetMark; null for sources that are not a social network. */
  network: string | null;
  /** "Instagram", "Meta Ads", "Google Analytics 4". */
  typeLabel: string;
  name: string;
  status: { tone: StatusTone; label: string; detail: string };
  /** "5 mins ago" plus the exact stamp underneath, both in the workspace timezone. */
  syncRelative: string | null;
  syncAbsolute: string | null;
  /** "Full access" / "Limited access" / "Read-only", and what that covers. */
  access: { label: string; detail: string };
  action: RowAction | null;
  detail: { capabilities: CapabilityItem[]; quota: ChannelQuota | null; message: string | null; scopes: string[] };
  /** External manager (ad platform), when the provider gives us one. */
  managerUrl: string | null;
};

export type SummaryCounts = { total: number; healthy: number; warnings: number; errors: number; expiring: number };

export type ExpiringRow = { id: string; network: string | null; title: string; note: string; action: RowAction };

/** A network or conversion source this workspace has not connected yet. */
export type RecommendedRow = { key: string; network: string | null; title: string; blurb: string; href: string | null };

/** A sign-in that came back but has no accounts chosen yet (connection.status = selecting). */
export type PendingRow = { id: string; network: string | null; title: string; note: string; selectHref: string };

export type AccountsData = {
  workspaceId: string;
  canManage: boolean;
  rows: IntegrationRow[];
  summary: SummaryCounts;
  expiring: ExpiringRow[];
  recommended: RecommendedRow[];
  pending: PendingRow[];
  /** Networks that can still be connected, for the header menu. */
  connectable: { key: string; displayName: string; networks: string[] }[];
};
