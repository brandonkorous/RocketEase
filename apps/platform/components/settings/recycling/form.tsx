"use client";

import { Button, Input, Label, Switch } from "@wizeworks/silicaui-react";
import type { RecycleOptions, RecycleRuleRow } from "@/lib/recycling/queries";

export type Draft = { id?: string; name: string; enabled: boolean; tagIds: string[]; channelIds: string[]; everyDays: string; atTime: string; maxRepeatsPerItem: string; pauseUntil: string };

export const blankDraft = (): Draft => ({ name: "", enabled: true, tagIds: [], channelIds: [], everyDays: "30", atTime: "09:00", maxRepeatsPerItem: "3", pauseUntil: "" });
export const draftFrom = (r: RecycleRuleRow): Draft => ({ id: r.id, name: r.name, enabled: r.enabled, tagIds: r.tagIds, channelIds: r.channelIds, everyDays: String(r.everyDays), atTime: r.atTime, maxRepeatsPerItem: String(r.maxRepeatsPerItem), pauseUntil: r.pauseUntilDay ?? "" });

type Props = { draft: Draft; options: RecycleOptions; timezone: string; pending: boolean; onChange: (d: Draft) => void; onSave: () => void; onCancel: () => void };

const chip = (on: boolean) => `rounded-field border px-2 py-1 text-xs ${on ? "border-base-content font-semibold" : "border-base-300 text-secondary"}`;

export function RuleForm({ draft, options, timezone, pending, onChange, onSave, onCancel }: Props) {
  const toggle = (key: "tagIds" | "channelIds", id: string) => onChange({ ...draft, [key]: draft[key].includes(id) ? draft[key].filter((x) => x !== id) : [...draft[key], id] });
  return (
    <form className="flex flex-col gap-4 rounded-box border border-base-300 p-4" onSubmit={(e) => { e.preventDefault(); onSave(); }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5"><Label htmlFor="rr-name">Name</Label><Input id="rr-name" size="sm" maxLength={80} value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value })} placeholder="e.g. Evergreen tips" /></div>
        <label className="flex items-end gap-2 pb-1 text-sm text-secondary">On <Switch checked={draft.enabled} onCheckedChange={(v: boolean) => onChange({ ...draft, enabled: v })} /></label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5"><Label htmlFor="rr-every">Every (days)</Label><Input id="rr-every" size="sm" type="number" min={1} max={365} value={draft.everyDays} onChange={(e) => onChange({ ...draft, everyDays: e.target.value })} /></div>
        <div className="flex flex-col gap-1.5"><Label htmlFor="rr-at">At ({timezone})</Label><Input id="rr-at" size="sm" type="time" value={draft.atTime} onChange={(e) => onChange({ ...draft, atTime: e.target.value })} /></div>
        <div className="flex flex-col gap-1.5"><Label htmlFor="rr-max">Max reuses per post</Label><Input id="rr-max" size="sm" type="number" min={1} max={50} value={draft.maxRepeatsPerItem} onChange={(e) => onChange({ ...draft, maxRepeatsPerItem: e.target.value })} /></div>
      </div>
      <Picker legend="Categories" hint="Only reuse posts carrying one of these tags. None selected = any post." items={options.tags} selected={draft.tagIds} onToggle={(id) => toggle("tagIds", id)} empty="Tag some content to filter by category." />
      <Picker legend="Channels" hint="Where the copy goes. None selected = wherever the original published." items={options.channels} selected={draft.channelIds} onToggle={(id) => toggle("channelIds", id)} empty="Connect an account first." />
      <div className="flex flex-col gap-1.5 sm:max-w-60"><Label htmlFor="rr-pause">Paused until <span className="font-normal text-secondary/70">(optional)</span></Label><Input id="rr-pause" size="sm" type="date" value={draft.pauseUntil} onChange={(e) => onChange({ ...draft, pauseUntil: e.target.value })} /></div>
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" color="neutral" onClick={onCancel}>Cancel</Button>
        <Button type="submit" size="sm" color="primary" loading={pending} disabled={!draft.name.trim()}>Save rule</Button>
      </div>
    </form>
  );
}

function Picker({ legend, hint, items, selected, onToggle, empty }: { legend: string; hint: string; items: { id: string; name: string }[]; selected: string[]; onToggle: (id: string) => void; empty: string }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-sm font-medium">{legend}</legend>
      <p className="text-xs text-secondary/70">{hint}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((i) => (<button key={i.id} type="button" aria-pressed={selected.includes(i.id)} onClick={() => onToggle(i.id)} className={chip(selected.includes(i.id))}>{i.name}</button>))}
        {items.length === 0 && <span className="text-xs text-secondary/70">{empty}</span>}
      </div>
    </fieldset>
  );
}
