"use client";

import { useState } from "react";
import { Badge, Button } from "@wizeworks/silicaui-react";
import { revokeGrant } from "@/lib/actions/settings/rights";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { ConfirmDialog } from "../confirm-dialog";
import { GrantForm, type GrantDraft } from "./rights-grant-form";

export type GrantRow = {
  id: string; kind: GrantDraft["kind"]; kindLabel: string; scope: GrantDraft["scope"]; scopeLabel: string;
  label: string; subject: string; reference: string | null; note: string | null;
  startsLabel: string | null; expiresLabel: string | null; startsInput: string; expiresInput: string;
  channelId: string; creatorHandle: string; assetId: string;
  /** "12 days left" / "Expires today" / "Expired 3 days ago"; null when the grant never expires. */
  remaining: string | null; expired: boolean; revoked: boolean;
};

export type RightsGrantsProps = { workspaceId: string; grants: GrantRow[]; channels: { id: string; name: string; network: string }[]; canEdit: boolean };

const blank = (): GrantDraft => ({ kind: "ugc_license", scope: "both", label: "", channelId: "", creatorHandle: "", assetId: "", startsAt: "", expiresAt: "", reference: "", note: "" });
const toDraft = (g: GrantRow): GrantDraft => ({ id: g.id, kind: g.kind, scope: g.scope, label: g.label, channelId: g.channelId, creatorHandle: g.creatorHandle, assetId: g.assetId, startsAt: g.startsInput, expiresAt: g.expiresInput, reference: g.reference ?? "", note: g.note ?? "" });

/** Rights & authorisation clocks (trends-2026 §4): UGC licences, Spark codes, partnership permissions, music. */
export function RightsGrants({ workspaceId, grants, channels, canEdit }: RightsGrantsProps) {
  const { run, pending } = useActionFeedback();
  const [draft, setDraft] = useState<GrantDraft | null>(null);
  const live = grants.filter((g) => !g.revoked);
  const past = grants.filter((g) => g.revoked);
  return (
    <section aria-labelledby="rights-h" className="mt-4">
      <div className="flex items-center justify-between gap-2">
        <h3 id="rights-h" className="text-base font-semibold">Authorisations</h3>
        {canEdit && !draft && <Button size="sm" color="primary" onClick={() => setDraft(blank())}>Record authorisation</Button>}
      </div>
      <p className="mt-1 max-w-160 text-sm leading-relaxed text-secondary">
        Every licence has a clock. Organic clearance rarely includes paid use, and Spark codes expire on their own schedule — so each authorisation carries its own scope and dates. Publishing and promoting are blocked when a clock ends before the post goes out or the flight finishes. Media-level rights stay on the asset itself, in Content.
      </p>
      {draft && <GrantForm workspaceId={workspaceId} draft={draft} channels={channels} onChange={setDraft} onDone={() => setDraft(null)} />}
      {live.length === 0 && !draft && <p className="mt-3 rounded-box border border-dashed border-base-300 px-4 py-6 text-center text-sm text-secondary">No authorisations recorded. Add one when a creator licences content, a Spark code arrives, or a partnership ad is approved.</p>}
      {live.length > 0 && (
        <ul className="mt-3 divide-y divide-base-300 rounded-box border border-base-300">
          {live.map((g) => (
            <GrantLine key={g.id} g={g} canEdit={canEdit} pending={pending} onEdit={() => setDraft(toDraft(g))} onRevoke={() => run(() => revokeGrant(workspaceId, g.id))} />
          ))}
        </ul>
      )}
      {past.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-secondary">Revoked ({past.length})</summary>
          <ul className="mt-2 divide-y divide-base-300 rounded-box border border-base-300">
            {past.map((g) => (<GrantLine key={g.id} g={g} canEdit={false} pending={pending} onEdit={() => {}} onRevoke={() => {}} />))}
          </ul>
        </details>
      )}
    </section>
  );
}

type LineProps = { g: GrantRow; canEdit: boolean; pending: boolean; onEdit: () => void; onRevoke: () => void };

function GrantLine({ g, canEdit, pending, onEdit, onRevoke }: LineProps) {
  const state = g.revoked ? { glyph: "⊘", label: "Revoked", color: "neutral" as const } : g.expired ? { glyph: "!", label: g.remaining ?? "Expired", color: "error" as const } : g.remaining ? { glyph: "◷", label: g.remaining, color: "warning" as const } : { glyph: "∞", label: "No expiry", color: "neutral" as const };
  return (
    <li className="flex flex-wrap items-start gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{g.label}</span>
          <span className="text-sm text-secondary/70">{g.kindLabel}</span>
          <Badge size="xs" variant="soft" color={state.color}><span aria-hidden="true">{state.glyph}</span> {state.label}</Badge>
          <Badge size="xs" variant="outline" color="neutral">{g.scopeLabel}</Badge>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-secondary">
          <span>{g.subject}</span>
          <span className="text-secondary/70">· {g.startsLabel ? `${g.startsLabel} → ` : ""}{g.expiresLabel ?? "no end date"}</span>
        </div>
        {g.reference && <p className="mt-1 break-all font-mono text-xs text-secondary/70">{g.reference}</p>}
        {g.note && <p className="mt-1 text-sm text-secondary">{g.note}</p>}
      </div>
      {canEdit && (
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" color="neutral" disabled={pending} onClick={onEdit}>Edit</Button>
          <ConfirmDialog trigger={<Button size="sm" variant="ghost" color="error" disabled={pending}>Revoke</Button>} title={`Revoke "${g.label}"?`} description="Scheduled posts and promotions that rely on this authorisation stop validating straight away." confirmLabel="Revoke" onConfirm={onRevoke} />
        </div>
      )}
    </li>
  );
}
