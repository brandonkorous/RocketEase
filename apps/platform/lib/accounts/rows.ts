/*
 * Row builders for the Connected accounts screen. One shape per group, all
 * reduced to IntegrationRow so the list renders the same columns for a social
 * channel, an ad account, and a conversion source.
 */
import { catalogEntry } from "@rocketease/providers";
import type { Capabilities } from "@rocketease/providers/client";
import type { ChannelQuota } from "@/lib/channel-quota";
import { channelCapabilityItems } from "@/lib/capabilities";
import type { Channel, ProviderConnection } from "@/db/schema/connections";
import type { TrackingKind, TrackingStatus } from "@/db/schema/tracking";
import { workspacePath } from "@/lib/nav";
import { CHANNEL_STATUS, agoLabel, channelAccess, stampLabel } from "./format";
import type { IntegrationRow, StatusTone } from "./types";

const sync = (at: Date | null, tz: string) => ({ syncRelative: at ? agoLabel(at, tz) : null, syncAbsolute: at ? stampLabel(at, tz) : null });

const reconnectHref = (provider: string, workspaceId: string, connectionId: string) =>
  `/api/connect/${provider}/start?workspaceId=${workspaceId}&reconnect=${connectionId}`;

export function socialRow(ch: Channel, conn: ProviderConnection, quota: ChannelQuota | null, tz: string, workspaceId: string, canManage: boolean): IntegrationRow {
  const st = CHANNEL_STATUS[ch.status] ?? CHANNEL_STATUS.degraded;
  // A dead connection outranks a channel that still looks healthy in its own row.
  const tone: StatusTone = conn.status === "expired" || conn.status === "revoked" ? "error" : st.tone;
  const detail = conn.status === "expired" ? "Token expired" : conn.status === "revoked" ? "Access revoked at the network" : (ch.health.message ?? st.detail);
  const caps = ch.capabilities;
  return {
    id: ch.id,
    group: "social",
    network: ch.network,
    typeLabel: catalogEntry(ch.kind)?.label ?? ch.kind.replace(/_/g, " "),
    name: ch.handle ?? ch.name,
    status: { tone, label: tone === "error" ? "Error" : tone === "warning" ? "Warning" : st.label, detail },
    ...sync(ch.lastSyncAt, tz),
    access: channelAccess(caps, ch.health.permissionsOk && tone !== "error"),
    action: canManage
      ? { label: tone === "error" ? "Re-authenticate" : "Reconnect", href: reconnectHref(conn.provider, workspaceId, conn.id), emphasis: tone === "error" }
      : null,
    detail: { capabilities: channelCapabilityItems(caps), quota, message: ch.health.message ?? null, scopes: conn.scopes },
    managerUrl: null,
  };
}

const PROVIDER_ADS_LABEL: Record<string, string> = { meta: "Meta", linkedin: "LinkedIn", tiktok: "TikTok", pinterest: "Pinterest", x: "X", mock: "Demo" };

const AD_STATUS: Record<string, { label: string; tone: StatusTone; detail: string }> = {
  active: { label: "Healthy", tone: "success", detail: "All systems go" },
  disabled: { label: "Error", tone: "error", detail: "Disabled at the ad platform" },
  closed: { label: "Error", tone: "error", detail: "Closed at the ad platform" },
  unknown: { label: "Warning", tone: "warning", detail: "The platform did not report a state" },
};

export type AdAccountInput = { id: string; name: string; provider: string; network: string | null; currency: string; status: string; lastSyncAt: Date | null; lastError: string | null; managerUrl: string | null; canManageAds: boolean };

export function adsRow(a: AdAccountInput, tz: string, workspaceId: string): IntegrationRow {
  const st = a.lastError ? AD_STATUS.unknown : (AD_STATUS[a.status] ?? AD_STATUS.unknown);
  return {
    id: a.id,
    group: "ads",
    network: a.network ?? a.provider,
    typeLabel: `${PROVIDER_ADS_LABEL[a.provider] ?? a.provider} Ads`,
    name: `${a.name} · ${a.currency}`,
    status: { tone: st.tone, label: st.label, detail: a.lastError ?? st.detail },
    ...sync(a.lastSyncAt, tz),
    // Paid import is read-only unless the channel's own capabilities allow managing ads (CAM-002).
    access: { label: a.canManageAds ? "Full access" : "Read-only", detail: a.canManageAds ? "Campaigns, Insights, Promotions" : "Campaigns, Insights" },
    action: { label: "Manage", href: workspacePath(workspaceId, "campaigns"), emphasis: false },
    detail: { capabilities: [], quota: null, message: a.lastError, scopes: [] },
    managerUrl: a.managerUrl,
  };
}

const TRACKING_STATUS: Record<TrackingStatus, { label: string; tone: StatusTone; detail: string }> = {
  connecting: { label: "Connecting", tone: "info", detail: "Finishing sign-in" },
  healthy: { label: "Healthy", tone: "success", detail: "All systems go" },
  action_required: { label: "Error", tone: "error", detail: "Needs attention" },
  disconnected: { label: "Disconnected", tone: "neutral", detail: "No longer connected" },
};

/** What each conversion source reports back to us — its own model, in its own window. */
const TRACKING_ACCESS: Record<TrackingKind, string> = {
  ga4: "Sessions, key events, revenue",
  shopify: "Orders, order value",
  webhook: "Posted conversions",
};

export type TrackingInput = { id: string; kind: TrackingKind; kindLabel: string; name: string; status: TrackingStatus; window: string; message: string | null; lastSyncAt: Date | null };

export function trackingRow(s: TrackingInput, tz: string, workspaceId: string): IntegrationRow {
  const st = TRACKING_STATUS[s.status];
  return {
    id: s.id,
    group: "analytics",
    network: null,
    typeLabel: s.kindLabel,
    name: s.name,
    status: { tone: st.tone, label: st.label, detail: s.message ?? st.detail },
    ...sync(s.lastSyncAt, tz),
    access: { label: "Read-only", detail: TRACKING_ACCESS[s.kind] },
    action: { label: "Manage", href: workspacePath(workspaceId, "settings/tracking"), emphasis: false },
    detail: { capabilities: [], quota: null, message: s.message ? `${s.message} · Window: ${s.window}` : `Attribution window: ${s.window}`, scopes: [] },
    managerUrl: null,
  };
}

/** Does any channel on this connection allow managing ads? Ad accounts inherit that. */
export const connectionManagesAds = (caps: Capabilities[]) => caps.some((c) => c.ads.manage);
