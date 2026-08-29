"use client";

import { useState } from "react";
import { Button } from "@wizeworks/silicaui-react";
import { buttonClasses } from "@wizeworks/silicaui-react/server";
import { disconnectChannel, resyncChannel } from "@/lib/actions/connections";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { ConnectionCard, type ChannelRow, type ConnectionRow } from "./accounts/connection-card";
import { NetMark } from "./library-screen";

export type { ChannelRow, ConnectionRow };
export type ProviderOption = { key: string; displayName: string; networks: string[]; accessSummary: string[] };
type Props = { workspaceId: string; connections: ConnectionRow[]; providers: ProviderOption[]; canManage: boolean };

export function AccountsPanel({ workspaceId, connections, providers, canManage }: Props) {
  const { run, pending } = useActionFeedback();
  const [confirm, setConfirm] = useState<ChannelRow | null>(null);
  return (
    <div className="mt-8 flex flex-col gap-10">
      {connections.length > 0 && (
        <section aria-labelledby="connected-heading" className="flex flex-col gap-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="connected-heading" className="text-base font-semibold">Connected</h2>
            <CapabilitiesLink />
          </div>
          {connections.map((conn) => (<ConnectionCard key={conn.id} conn={conn} workspaceId={workspaceId} canManage={canManage} pending={pending} onResync={(ch) => run(() => resyncChannel(workspaceId, ch.id))} onDisconnect={setConfirm} />))}
        </section>
      )}
      {confirm && <DisconnectDialog ch={confirm} pending={pending} onCancel={() => setConfirm(null)} onConfirm={() => { const ch = confirm; setConfirm(null); run(() => disconnectChannel(workspaceId, ch.id)); }} />}
      <ProviderPicker workspaceId={workspaceId} providers={providers} canManage={canManage} hasConnections={connections.length > 0} />
    </div>
  );
}

/** The public capability contract (app/(public)/capabilities) — opens outside the app shell. */
function CapabilitiesLink() {
  return <a href="/capabilities" target="_blank" rel="noreferrer" className="text-sm font-medium text-secondary underline underline-offset-2 hover:text-base-content">See what each network supports</a>;
}

function DisconnectDialog({ ch, pending, onCancel, onConfirm }: { ch: ChannelRow; pending: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="dc-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-110 rounded-box border border-base-300 bg-base-100 p-6">
        <h3 id="dc-title" className="text-lg font-bold">Disconnect {ch.name}?</h3>
        <ul className="mt-3 list-disc pl-5 text-sm leading-relaxed text-secondary">
          <li>Scheduled posts to this account will fail until it is reconnected.</li><li>Inbox sync and analytics for it stop now.</li><li>We revoke our access at the network and delete the stored token.</li><li>Past posts, conversations, and reports are kept.</li>
        </ul>
        <div className="mt-5 flex justify-end gap-2"><Button variant="ghost" color="neutral" onClick={onCancel}>Keep connected</Button><Button color="error" loading={pending} onClick={onConfirm}>Disconnect</Button></div>
      </div>
    </div>
  );
}

function ProviderPicker({ workspaceId, providers, canManage, hasConnections }: { workspaceId: string; providers: ProviderOption[]; canManage: boolean; hasConnections: boolean }) {
  return (
    <section aria-labelledby="add-heading">
      <h2 id="add-heading" className="text-base font-semibold">{hasConnections ? "Add another network" : "Connect a network"}</h2>
      <p className="mt-1 text-sm text-secondary">You choose exactly which pages or accounts join this workspace after signing in with the network.</p>
      <p className="mt-1 text-sm"><CapabilitiesLink /></p>
      <ul className="mt-4 grid gap-4 md:grid-cols-2">
        {providers.map((p) => (
          <li key={p.key} className="flex flex-col rounded-box border border-base-300 p-5">
            <div className="flex items-center gap-2">{p.networks.map((n) => (<NetMark key={n} network={n} size={22} />))}<span className="font-semibold">{p.displayName}</span></div>
            <ul className="mt-3 flex-1 list-disc pl-5 text-sm leading-relaxed text-secondary">{p.accessSummary.map((s) => (<li key={s}>{s}</li>))}</ul>
            {canManage ? <a href={`/api/connect/${p.key}/start?workspaceId=${workspaceId}`} className={`${buttonClasses({ color: "primary", size: "sm" })} mt-4 self-start`}>Connect {p.displayName}</a> : <p className="mt-4 text-sm text-secondary/70">Ask a workspace admin to connect this.</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
