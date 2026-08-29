"use client";

import { useState } from "react";
import { Button, Input, Label, Switch, Textarea } from "@wizeworks/silicaui-react";
import { GOALS, GOAL_LABELS, MAX_CONCEPTS, MAX_KEY_POINTS, type Goal } from "@/lib/ai/generator/types";
import { NetMark } from "../net-mark";
import type { GeneratorApi } from "./use-generator";
import type { GeneratorChannel, SavedBriefView } from "./types";

type Props = { api: GeneratorApi; channels: GeneratorChannel[]; savedBriefs: SavedBriefView[] };

export function BriefForm({ api, channels, savedBriefs }: Props) {
  const { brief, set } = api;
  const adCapable = channels.filter((c) => c.adCapable && brief.channels.includes(c.id));
  const ready = brief.topic.trim().length > 2 && brief.channels.length > 0;

  return (
    <section className="rounded-box border border-base-300" aria-labelledby="brief-h">
      <div className="flex items-center justify-between gap-3 border-b border-base-300 px-5 py-4">
        <h2 id="brief-h" className="text-base font-semibold">Brief</h2>
        {savedBriefs.length > 0 && <SavedPicker savedBriefs={savedBriefs} onPick={(b) => api.setBrief(b)} />}
      </div>

      <div className="flex flex-col gap-4 px-5 py-4">
        <Goals value={brief.goal} onChange={(goal) => set({ goal })} />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="topic">What is this about?</Label>
          <Textarea id="topic" rows={2} value={brief.topic} onChange={(e) => set({ topic: e.target.value })} placeholder="The one thing this post is about." />
        </div>

        <KeyPoints points={brief.keyPoints} onChange={(keyPoints) => set({ keyPoints })} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="audience" label="Audience" hint="Optional" value={brief.audience ?? ""} onChange={(audience) => set({ audience })} placeholder="Who this is for" />
          <Field id="offer" label="Offer" hint="Only what you type" value={brief.offer ?? ""} onChange={(offer) => set({ offer })} placeholder="e.g. 20% off until 30 June" />
          <Field id="tone" label="Tone for this run" hint="Overrides brand voice" value={brief.tone ?? ""} onChange={(tone) => set({ tone })} placeholder="Brand voice unless set" />
          <Field id="language" label="Language" hint="Optional" value={brief.language ?? ""} onChange={(language) => set({ language })} placeholder="English unless set" />
        </div>
        <p className="text-xs text-secondary/70">Nothing outside this brief is invented — no prices, statistics, or claims you haven&apos;t written here.</p>

        <Channels channels={channels} selected={brief.channels} onToggle={(id) => set({ channels: brief.channels.includes(id) ? brief.channels.filter((c) => c !== id) : [...brief.channels, id] })} />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Counts value={brief.count} onChange={(count) => set({ count })} />
          {adCapable.length > 0 && (
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={brief.includeAds} onCheckedChange={(v) => set({ includeAds: v })} />
              Include ad variants ({adCapable.map((c) => c.networkLabel).join(", ")})
            </label>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-base-300 px-5 py-4">
        <Button color="primary" onClick={api.run} disabled={!ready || api.busy === "run"}>{api.busy === "run" ? "Generating…" : "Generate concepts"}</Button>
        <SaveBrief onSave={api.save} disabled={!ready} />
      </div>
    </section>
  );
}

function Goals({ value, onChange }: { value: Goal; onChange: (g: Goal) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">Goal</span>
      <div className="flex flex-wrap gap-1 rounded-field border border-base-300 p-1" role="group" aria-label="Goal">
        {GOALS.map((g) => (
          <button key={g} type="button" onClick={() => onChange(g)} aria-pressed={value === g} className={`rounded-md px-3 py-1.5 text-sm ${value === g ? "bg-base-200 font-semibold" : "text-secondary hover:bg-base-100"}`}>
            {GOAL_LABELS[g]}
          </button>
        ))}
      </div>
    </div>
  );
}

function KeyPoints({ points, onChange }: { points: string[]; onChange: (p: string[]) => void }) {
  const update = (i: number, v: string) => onChange(points.map((p, idx) => (idx === i ? v : p)));
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">Key points</span>
      <ul className="flex flex-col gap-2">
        {points.map((p, i) => (
          <li key={i} className="flex items-center gap-2">
            <Input value={p} onChange={(e) => update(i, e.target.value)} placeholder="A fact the post may use" aria-label={`Key point ${i + 1}`} />
            {points.length > 1 && <Button size="sm" variant="ghost" color="neutral" onClick={() => onChange(points.filter((_, idx) => idx !== i))} aria-label={`Remove key point ${i + 1}`}>Remove</Button>}
          </li>
        ))}
      </ul>
      {points.length < MAX_KEY_POINTS && <div><Button size="sm" variant="outline" color="neutral" onClick={() => onChange([...points, ""])}>Add key point</Button></div>}
    </div>
  );
}

function Channels({ channels, selected, onToggle }: { channels: GeneratorChannel[]; selected: string[]; onToggle: (id: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">Channels</span>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Channels">
        {channels.map((c) => {
          const on = selected.includes(c.id);
          return (
            <button key={c.id} type="button" onClick={() => onToggle(c.id)} aria-pressed={on} className={`flex items-center gap-2 rounded-field border px-3 py-2 text-sm transition ${on ? "border-base-content font-semibold" : "border-base-300 text-secondary hover:bg-base-100"}`}>
              <NetMark network={c.network} size={18} />
              <span className="max-w-40 truncate">{c.name}</span>
              {c.adCapable && <span className="rounded-field bg-base-200 px-1.5 py-0.5 text-xs">Ads</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Counts({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium">Concepts per channel</span>
      <div className="flex rounded-field border border-base-300 p-0.5" role="group" aria-label="Concepts per channel">
        {Array.from({ length: MAX_CONCEPTS }, (_, i) => i + 1).map((n) => (
          <button key={n} type="button" onClick={() => onChange(n)} aria-pressed={value === n} className={`rounded-md px-2.5 py-1 text-sm ${value === n ? "bg-base-200 font-semibold" : "text-secondary"}`}>{n}</button>
        ))}
      </div>
    </div>
  );
}

function Field({ id, label, hint, value, onChange, placeholder }: { id: string; label: string; hint: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label} <span className="font-normal text-secondary/70">({hint})</span></Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

function SavedPicker({ savedBriefs, onPick }: { savedBriefs: SavedBriefView[]; onPick: (b: SavedBriefView["brief"]) => void }) {
  return (
    <select className="select select-sm w-auto" aria-label="Load a saved brief" defaultValue="" onChange={(e) => { const b = savedBriefs.find((s) => s.id === e.target.value); if (b) onPick(b.brief); }}>
      <option value="">Load a saved brief…</option>
      {savedBriefs.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
    </select>
  );
}

function SaveBrief({ onSave, disabled }: { onSave: (name: string) => void; disabled: boolean }) {
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  if (!open) return <Button variant="ghost" color="neutral" disabled={disabled} onClick={() => setOpen(true)}>Save brief</Button>;
  return (
    <span className="flex items-center gap-2">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this brief" aria-label="Brief name" />
      <Button variant="outline" color="neutral" disabled={!name.trim()} onClick={() => { onSave(name.trim()); setOpen(false); setName(""); }}>Save</Button>
      <Button variant="ghost" color="neutral" onClick={() => setOpen(false)}>Cancel</Button>
    </span>
  );
}
