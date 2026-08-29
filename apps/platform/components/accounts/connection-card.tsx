"use client";

import { Avatar, Badge, Button } from "@wizeworks/silicaui-react";
import { buttonClasses } from "@wizeworks/silicaui-react/server";
import type { Capabilities } from "@make-it-social/providers";
import { channelCapabilityItems } from "@/lib/capabilities";
import { CapabilityList } from "@/components/shared/why-not";
import type { ChannelQuota } from "@/lib/channel-quota";
import { NetMark } from "../library-screen";
import { QuotaGauge } from "./quota-gauge";

export type ChannelRow = { id: string; network: string; kind: string; name: string; handle: string | null; avatarUrl: string | null; status: string; healthMessage: string | null; lastSyncAt: string | null; formats: string[]; capabilities: Capabilities; quota: ChannelQuota | null };
export type ConnectionRow = { id: string; provider: string; providerName: string; providerUserName: string | null; status: string; expiresAt: string | null; scopes: string[]; channels: ChannelRow[] };

const STATUS: Record<string, { label: string; color: "success" | "warning" | "error" | "neutral" | "info" }> = {
  connecting: { label: "Connecting", color: "info" }, syncing: { label: "Syncing", color: "info" }, healthy: { label: "Healthy", color: "success" }, degraded: { label: "Limited", color: "warning" },
  action_required: { label: "Action required", color: "error" }, revoked: { label: "Revoked", color: "error" }, disconnected: { label: "Disconnected", color: "neutral" },
};

type Props = { conn: ConnectionRow; workspaceId: string; canManage: boolean; pending: boolean; onResync: (ch: ChannelRow) => void; onDisconnect: (ch: ChannelRow) => void };

export function ConnectionCard({ conn, workspaceId, canManage, pending, onResync, onDisconnect }: Props) {
  return (
    <div className="rounded-box border border-base-300">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 px-5 py-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold">{conn.providerName}</span><span className="text-secondary/70">· {conn.providerUserName ?? "connected account"}</span>
          {conn.status !== "active" && <Badge size="xs" variant="soft" color={conn.status === "disconnected" ? "neutral" : "error"}>{conn.status.replace("_", " ")}</Badge>}
        </div>
        <div className="flex items-center gap-2 text-sm text-secondary/70">
          {conn.expiresAt && <span>Token renews before {new Date(conn.expiresAt).toLocaleDateString()}</span>}
          {canManage && conn.status !== "disconnected" && <a href={`/api/connect/${conn.provider}/start?workspaceId=${workspaceId}&reconnect=${conn.id}`} className={buttonClasses({ size: "sm", variant: "outline", color: "neutral" })}>Reconnect</a>}
        </div>
      </div>
      <ul className="divide-y divide-base-300">
        {conn.channels.map((ch) => (<ChannelLine key={ch.id} ch={ch} canManage={canManage} pending={pending} onResync={onResync} onDisconnect={onDisconnect} />))}
      </ul>
    </div>
  );
}

function ChannelLine({ ch, canManage, pending, onResync, onDisconnect }: { ch: ChannelRow; canManage: boolean; pending: boolean; onResync: (ch: ChannelRow) => void; onDisconnect: (ch: ChannelRow) => void }) {
  const st = STATUS[ch.status] ?? STATUS.degraded;
  return (
    <li className="flex flex-wrap items-center gap-4 px-5 py-4">
      <Avatar size="md" shape="rounded" color="neutral" alt="" src={ch.avatarUrl ?? undefined}>{ch.name.slice(0, 2).toUpperCase()}</Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><NetMark network={ch.network} /><span className="font-semibold">{ch.name}</span>{ch.handle && <span className="text-sm text-secondary/70">{ch.handle}</span>}<Badge size="xs" variant="soft" color={st.color}>{st.label}</Badge></div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-secondary">
          <span>{ch.formats.length ? `Publishes: ${ch.formats.join(", ")}` : "Read-only"}</span>
          <span className="text-secondary/70">· {ch.lastSyncAt ? `Checked ${new Date(ch.lastSyncAt).toLocaleString()}` : "Not checked yet"}</span>
        </div>
        {/* What this network allows, with the reason attached to anything it doesn't (CAPABILITY_CATALOG). */}
        <CapabilityList items={channelCapabilityItems(ch.capabilities)} className="mt-2" />
        {ch.healthMessage && <p className="mt-1 text-sm text-secondary">{ch.healthMessage}</p>}
        {ch.quota && <QuotaGauge quota={ch.quota} />}
      </div>
      {canManage && ch.status !== "disconnected" && (
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" color="neutral" disabled={pending} onClick={() => onResync(ch)}>Check now</Button>
          <Button size="sm" variant="ghost" color="error" disabled={pending} onClick={() => onDisconnect(ch)}>Disconnect</Button>
        </div>
      )}
    </li>
  );
}
