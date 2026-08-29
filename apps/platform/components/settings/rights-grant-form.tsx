"use client";

import { Button, Input, Label, Textarea } from "@wizeworks/silicaui-react";
import { GRANT_KINDS, RIGHTS_SCOPES } from "@/db/schema/rights";
import { saveGrant } from "@/lib/actions/settings/rights";
import { useActionFeedback } from "@/lib/use-action-feedback";

export type GrantDraft = {
  id?: string;
  kind: (typeof GRANT_KINDS)[number];
  scope: (typeof RIGHTS_SCOPES)[number];
  label: string; channelId: string; creatorHandle: string; assetId: string;
  startsAt: string; expiresAt: string; reference: string; note: string;
};

const KIND_OPTIONS: { value: GrantDraft["kind"]; label: string }[] = [
  { value: "ugc_license", label: "UGC licence" },
  { value: "spark_code", label: "Spark code" },
  { value: "partnership_ad", label: "Partnership ad" },
  { value: "music_license", label: "Music licence" },
  { value: "other", label: "Other" },
];
const SCOPE_OPTIONS: { value: GrantDraft["scope"]; label: string }[] = [
  { value: "organic", label: "Organic only" },
  { value: "paid", label: "Paid only" },
  { value: "both", label: "Organic and paid" },
];

type Props = { workspaceId: string; draft: GrantDraft; channels: { id: string; name: string; network: string }[]; onChange: (d: GrantDraft) => void; onDone: () => void };

export function GrantForm({ workspaceId, draft, channels, onChange, onDone }: Props) {
  const { run, pending } = useActionFeedback();
  const set = <K extends keyof GrantDraft>(k: K, v: GrantDraft[K]) => onChange({ ...draft, [k]: v });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(() => saveGrant({ workspaceId, ...draft }), (r) => { if (!r.error) onDone(); });
  };
  return (
    <form onSubmit={submit} className="mt-3 flex flex-col gap-3 rounded-box border border-base-300 p-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_180px_180px]">
        <Field id="g-label" label="Name">
          <Input id="g-label" size="sm" value={draft.label} onChange={(e) => set("label", e.target.value)} maxLength={140} placeholder="Mara · spring set" required />
        </Field>
        <Field id="g-kind" label="Type">
          <select id="g-kind" className="select select-sm" value={draft.kind} onChange={(e) => set("kind", e.target.value as GrantDraft["kind"])}>
            {KIND_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
          </select>
        </Field>
        <Field id="g-scope" label="Covers">
          <select id="g-scope" className="select select-sm" value={draft.scope} onChange={(e) => set("scope", e.target.value as GrantDraft["scope"])}>
            {SCOPE_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
          </select>
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id="g-channel" label="Channel (optional)">
          <select id="g-channel" className="select select-sm" value={draft.channelId} onChange={(e) => set("channelId", e.target.value)}>
            <option value="">Not channel-specific</option>
            {channels.map((c) => (<option key={c.id} value={c.id}>{c.name} · {c.network}</option>))}
          </select>
        </Field>
        <Field id="g-handle" label="Creator handle (optional)">
          <Input id="g-handle" size="sm" value={draft.creatorHandle} onChange={(e) => set("creatorHandle", e.target.value)} maxLength={80} placeholder="@mara" />
        </Field>
        <Field id="g-ref" label="Reference (optional)">
          <Input id="g-ref" size="sm" value={draft.reference} onChange={(e) => set("reference", e.target.value)} maxLength={300} placeholder="Spark code or contract URL" />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id="g-start" label="Starts"><Input id="g-start" size="sm" type="date" value={draft.startsAt} onChange={(e) => set("startsAt", e.target.value)} /></Field>
        <Field id="g-end" label="Expires"><Input id="g-end" size="sm" type="date" value={draft.expiresAt} onChange={(e) => set("expiresAt", e.target.value)} /></Field>
      </div>
      <Field id="g-note" label="Note (optional)">
        <Textarea id="g-note" rows={2} value={draft.note} onChange={(e) => set("note", e.target.value)} maxLength={1000} className="w-full text-sm" placeholder="What exactly is allowed, and where" />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" color="neutral" onClick={onDone}>Cancel</Button>
        <Button type="submit" size="sm" color="primary" loading={pending} disabled={!draft.label.trim()}>{draft.id ? "Save changes" : "Record authorisation"}</Button>
      </div>
    </form>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (<div className="flex flex-col gap-1.5"><Label htmlFor={id}>{label}</Label>{children}</div>);
}
