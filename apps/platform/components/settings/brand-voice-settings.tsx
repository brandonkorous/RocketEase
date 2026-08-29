"use client";

import { useState } from "react";
import { Alert, Button, Input, Label, Textarea } from "@wizeworks/silicaui-react";
import { BRAND_VOICE_LIMITS, type BrandVoice } from "@/lib/ai/brand-voice";
import { setBrandVoice } from "@/lib/actions/settings/brand-voice";
import { useActionFeedback } from "@/lib/use-action-feedback";

type Props = { workspaceId: string; initial: BrandVoice; canEdit: boolean; aiEnabled: boolean };

type ListKey = "doList" | "dontList";
const LISTS: { key: ListKey; label: string; hint: string; placeholder: string }[] = [
  { key: "doList", label: "Do", hint: "One per line.", placeholder: "Lead with the customer's problem\nName the product once" },
  { key: "dontList", label: "Don't", hint: "One per line.", placeholder: "No exclamation marks\nNever say \"revolutionary\"" },
];

const toLines = (list: string[]) => list.join("\n");
const fromLines = (v: string, max: number) => v.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, max);
const fromBlocks = (v: string, max: number) => v.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean).slice(0, max);

/** Brand voice: the only thing that personalises an AI draft. A person still edits and sends it. */
export function BrandVoiceSettings({ workspaceId, initial, canEdit, aiEnabled }: Props) {
  const { run, pending } = useActionFeedback();
  const [v, setV] = useState<BrandVoice>(initial);
  const [examples, setExamples] = useState(initial.examples.join("\n\n"));
  const dirty = JSON.stringify(v) !== JSON.stringify(initial) || examples !== initial.examples.join("\n\n");

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    run(() => setBrandVoice({ ...v, examples: fromBlocks(examples, BRAND_VOICE_LIMITS.examples), workspaceId }));
  };

  return (
    <form onSubmit={save} className="mt-4 flex max-w-180 flex-col gap-6">
      <p className="text-sm leading-relaxed text-secondary">
        How this brand sounds. Drafting uses it as guidance — it never invents facts, offers, or prices, and nothing is published, spent, or answered until a person presses send.
      </p>
      {!aiEnabled && <Alert color="info" variant="soft" role="status">Drafting is turned off for this deployment. Brand voice is saved and used as soon as it is enabled.</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bv-tone">Tone</Label>
          <Input id="bv-tone" size="sm" value={v.tone} disabled={!canEdit} maxLength={BRAND_VOICE_LIMITS.tone} placeholder="Direct, warm, no jargon" onChange={(e) => setV({ ...v, tone: e.target.value })} />
          <span className="text-xs text-secondary/70">A few words, the way you would brief a new writer.</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bv-audience">Audience</Label>
          <Input id="bv-audience" size="sm" value={v.audience} disabled={!canEdit} maxLength={BRAND_VOICE_LIMITS.audience} placeholder="Independent salon owners" onChange={(e) => setV({ ...v, audience: e.target.value })} />
          <span className="text-xs text-secondary/70">Who reads these posts.</span>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {LISTS.map((l) => (
          <div key={l.key} className="flex flex-col gap-1.5">
            <Label htmlFor={`bv-${l.key}`}>{l.label}</Label>
            <Textarea id={`bv-${l.key}`} rows={4} className="w-full text-sm" disabled={!canEdit} value={toLines(v[l.key])} placeholder={l.placeholder} onChange={(e) => setV({ ...v, [l.key]: fromLines(e.target.value, BRAND_VOICE_LIMITS.items) })} />
            <span className="text-xs text-secondary/70">{l.hint}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bv-examples">Posts that already sound right</Label>
        <Textarea id="bv-examples" rows={6} className="w-full text-sm" disabled={!canEdit} value={examples} placeholder="Paste a post you were happy with.&#10;&#10;Separate each one with a blank line." onChange={(e) => setExamples(e.target.value)} />
        <span className="text-xs text-secondary/70">Up to {BRAND_VOICE_LIMITS.examples}, separated by a blank line. Drafting copies the voice, never the facts.</span>
      </div>
      {canEdit ? <div><Button type="submit" color="primary" loading={pending} disabled={!dirty}>Save brand voice</Button></div> : <p className="text-xs text-secondary/70">Only owners and admins can change the brand voice.</p>}
    </form>
  );
}
