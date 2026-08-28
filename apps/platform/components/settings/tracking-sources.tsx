"use client";

import { useState } from "react";
import { Badge, Button } from "@wizeworks/silicaui-react";
import { disconnectTrackingSource, rotateWebhookSecret, syncTrackingSourceNow } from "@/lib/actions/settings/tracking-sources";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { ConnectSource, SecretPanel, type NewSecret } from "./tracking-connect";

export type TrackingSourceRow = {
  id: string;
  kind: "ga4" | "shopify" | "webhook";
  kindLabel: string;
  name: string;
  status: "connecting" | "healthy" | "action_required" | "disconnected";
  window: string;
  lastSyncLabel: string | null;
  message: string | null;
  endpoint: string | null;
};

export type TrackingSourcesProps = { workspaceId: string; sources: TrackingSourceRow[]; canEdit: boolean; enabled: { ga4: boolean; shopify: boolean } };

const STATUS: Record<TrackingSourceRow["status"], { label: string; color: "success" | "warning" | "error" | "neutral" | "info"; glyph: string }> = {
  connecting: { label: "Connecting", color: "info", glyph: "◌" },
  healthy: { label: "Healthy", color: "success", glyph: "✓" },
  action_required: { label: "Action required", color: "error", glyph: "!" },
  disconnected: { label: "Disconnected", color: "neutral", glyph: "–" },
};

/** Conversion sources: what reports conversions back to us, and how fresh each one is. */
export function TrackingSources({ workspaceId, sources, canEdit, enabled }: TrackingSourcesProps) {
  const { run, pending } = useActionFeedback();
  const [secret, setSecret] = useState<NewSecret | null>(null);
  const live = sources.filter((s) => s.status !== "disconnected");

  return (
    <section aria-labelledby="sources-h">
      <h3 id="sources-h" className="text-base font-semibold">Conversion sources</h3>
      <p className="mt-1 text-sm leading-relaxed text-secondary">
        What happens after the click. Each source reports conversions under its own attribution model and window, in its own currency; we import what it reports and never re-model or convert it. Conversions and revenue stay unavailable until a healthy source exists.
      </p>

      {live.length > 0 && (
        <ul className="mt-3 divide-y divide-base-300 rounded-box border border-base-300">
          {live.map((s) => (
            <SourceLine
              key={s.id}
              s={s}
              canEdit={canEdit}
              pending={pending}
              onSync={() => run(() => syncTrackingSourceNow({ workspaceId, sourceId: s.id }))}
              onDisconnect={() => run(() => disconnectTrackingSource({ workspaceId, sourceId: s.id }))}
              onRotate={() => run(() => rotateWebhookSecret({ workspaceId, sourceId: s.id }), (r) => { if (r.secret && r.endpoint) setSecret({ secret: r.secret, endpoint: r.endpoint }); })}
            />
          ))}
        </ul>
      )}
      {live.length === 0 && <p className="mt-3 rounded-box border border-dashed border-base-300 px-4 py-6 text-center text-sm text-secondary">No conversion source connected. Conversions, revenue, and ROAS are shown as unavailable with the reason, never as zero.</p>}

      {secret && <SecretPanel secret={secret} onDismiss={() => setSecret(null)} />}
      {canEdit ? <ConnectSource workspaceId={workspaceId} enabled={enabled} onSecret={setSecret} /> : <p className="mt-3 text-xs text-secondary/70">Only owners and admins can connect conversion sources.</p>}
    </section>
  );
}

type LineProps = { s: TrackingSourceRow; canEdit: boolean; pending: boolean; onSync: () => void; onDisconnect: () => void; onRotate: () => void };

function SourceLine({ s, canEdit, pending, onSync, onDisconnect, onRotate }: LineProps) {
  const st = STATUS[s.status];
  return (
    <li className="flex flex-wrap items-start gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{s.name}</span>
          <span className="text-sm text-secondary/70">{s.kindLabel}</span>
          <Badge size="xs" variant="soft" color={st.color}>
            <span aria-hidden="true">{st.glyph}</span> {st.label}
          </Badge>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-secondary">
          <span>Window: {s.window}</span>
          <span className="text-secondary/70">· {s.lastSyncLabel ? `Last import ${s.lastSyncLabel}` : "Not imported yet"}</span>
        </div>
        {s.message && <p className="mt-1 text-sm text-secondary">{s.message}</p>}
        {s.endpoint && <p className="mt-1 break-all font-mono text-xs text-secondary/70">{s.endpoint}</p>}
      </div>
      {canEdit && (
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" color="neutral" disabled={pending} onClick={onSync}>Check now</Button>
          {s.kind === "webhook" && <Button size="sm" variant="ghost" color="neutral" disabled={pending} onClick={onRotate}>Rotate secret</Button>}
          <Button size="sm" variant="ghost" color="error" disabled={pending} onClick={onDisconnect}>Disconnect</Button>
        </div>
      )}
    </li>
  );
}
