"use client";

import { Button, Checkbox, Input, Label, Switch } from "@wizeworks/silicaui-react";
import { WORKSPACE_ROLES, type WorkspaceRole } from "@/db/schema/app";

export type PolicyDraft = { id?: string; name: string; enabled: boolean; channelIds: string[]; authorRoles: WorkspaceRole[]; approverRoles: WorkspaceRole[]; separationOfDuty: boolean; dueHours: number };
type Props = { draft: PolicyDraft; channels: { id: string; name: string }[]; pending: boolean; onChange: (d: PolicyDraft) => void; onSave: (d: PolicyDraft) => void; onCancel: () => void };

const APPROVERS: WorkspaceRole[] = ["owner", "admin", "manager", "client_approver"];
const toggle = <T,>(list: T[], v: T, on: boolean) => (on ? [...list, v] : list.filter((x) => x !== v));

export function PolicyForm({ draft, channels, pending, onChange, onSave, onCancel }: Props) {
  return (
    <form className="mt-4 grid gap-4 rounded-box border border-base-300 p-5" onSubmit={(e) => { e.preventDefault(); onSave(draft); }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5"><Label htmlFor="p-name">Policy name</Label><Input id="p-name" value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value })} placeholder="e.g. Client review for Instagram" required /></div>
        <div className="flex flex-col gap-1.5"><Label htmlFor="p-due">Reviewers have (hours)</Label><Input id="p-due" type="number" min={1} max={720} value={draft.dueHours} onChange={(e) => onChange({ ...draft, dueHours: Number(e.target.value) })} /></div>
      </div>
      <CheckGroup label="Applies to posts by" hint="Leave all unchecked to apply to everyone." options={WORKSPACE_ROLES.map((r) => ({ id: r, label: r.replace("_", " ") }))} value={draft.authorRoles} onChange={(v) => onChange({ ...draft, authorRoles: v as WorkspaceRole[] })} />
      <CheckGroup label="Only for these channels" hint="Leave all unchecked to apply to every channel." options={channels.map((c) => ({ id: c.id, label: c.name }))} value={draft.channelIds} onChange={(v) => onChange({ ...draft, channelIds: v })} empty="No channels connected yet." />
      <CheckGroup label="Who can approve" options={APPROVERS.map((r) => ({ id: r, label: r.replace("_", " ") }))} value={draft.approverRoles} onChange={(v) => onChange({ ...draft, approverRoles: v as WorkspaceRole[] })} />
      <div className="flex flex-wrap items-center gap-6 text-sm">
        <label className="flex items-center gap-2">Separation of duty <Switch checked={draft.separationOfDuty} onCheckedChange={(v: boolean) => onChange({ ...draft, separationOfDuty: v })} /></label>
        <label className="flex items-center gap-2">Enabled <Switch checked={draft.enabled} onCheckedChange={(v: boolean) => onChange({ ...draft, enabled: v })} /></label>
      </div>
      <div className="flex gap-2"><Button type="submit" color="primary" loading={pending}>Save policy</Button><Button type="button" variant="ghost" color="neutral" onClick={onCancel}>Cancel</Button></div>
    </form>
  );
}

function CheckGroup({ label, hint, options, value, onChange, empty }: { label: string; hint?: string; options: { id: string; label: string }[]; value: string[]; onChange: (v: string[]) => void; empty?: string }) {
  return (
    <div>
      <Label className="text-sm font-semibold">{label}</Label>
      <div className="mt-2 flex flex-wrap gap-3">
        {options.map((o) => (<label key={o.id} className="flex items-center gap-1.5 text-sm capitalize"><Checkbox checked={value.includes(o.id)} onChange={(e) => onChange(toggle(value, o.id, e.target.checked))} />{o.label}</label>))}
        {options.length === 0 && empty && <span className="text-xs text-secondary/70">{empty}</span>}
      </div>
      {hint && <p className="mt-1 text-xs text-secondary/70">{hint}</p>}
    </div>
  );
}
