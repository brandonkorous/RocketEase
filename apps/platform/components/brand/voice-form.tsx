"use client";

import { Alert } from "@wizeworks/silicaui-react";
import { BRAND_VOICE_LIMITS as VL, type BrandVoice } from "@/lib/ai/brand-voice";
import type { VoiceRules } from "@/lib/brand/types";
import { AreaField, Field, LinesField, SaveBar, SectionIntro, SelectField } from "./fields";
import { useSectionForm } from "./use-section-form";

type Values = BrandVoice & VoiceRules;
type Props = { workspaceId: string; voice: BrandVoice; rules: VoiceRules; canEdit: boolean; aiEnabled: boolean };

const EMOJI = [
  { value: "", label: "No preference" },
  { value: "none", label: "Never use emoji" },
  { value: "sparing", label: "One at most, where it earns it" },
  { value: "freely", label: "Emoji are welcome" },
];
const SPELLING = [
  { value: "", label: "No preference" },
  { value: "us", label: "US spelling" },
  { value: "uk", label: "British spelling" },
];

const fromBlocks = (v: string, max: number) => v.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean).slice(0, max);

export function VoiceForm({ workspaceId, voice, rules, canEdit, aiEnabled }: Props) {
  const initial: Values = { ...voice, ...rules };
  const { v, set, dirty, save, pending } = useSectionForm<Values>(workspaceId, "voice", initial);
  const d = !canEdit;

  return (
    <form onSubmit={save} className="mt-4 flex max-w-180 flex-col gap-6">
      <SectionIntro>
        How this brand sounds. Drafting uses it as guidance — it never invents facts, offers, or prices, and nothing is published, spent, or answered until a person presses send.
      </SectionIntro>
      {!aiEnabled && <Alert color="info" variant="soft" role="status">Drafting is turned off for this deployment. Voice is saved and used as soon as it is enabled.</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="bv-tone" label="Tone" hint="A few words, the way you would brief a new writer." value={v.tone} disabled={d} maxLength={VL.tone} placeholder="Direct, warm, no jargon" onChange={(tone) => set({ tone })} />
        <Field id="bv-aud" label="Audience" hint="Who reads these posts." value={v.audience} disabled={d} maxLength={VL.audience} placeholder="Independent salon owners" onChange={(audience) => set({ audience })} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <LinesField id="bv-do" label="Do" value={v.doList} disabled={d} max={VL.items} placeholder="Lead with the customer's problem&#10;Name the product once" onChange={(doList) => set({ doList })} />
        <LinesField id="bv-dont" label="Don't" value={v.dontList} disabled={d} max={VL.items} placeholder="No exclamation marks&#10;Never say &quot;revolutionary&quot;" onChange={(dontList) => set({ dontList })} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField id="bv-emoji" label="Emoji" value={v.emoji} disabled={d} options={EMOJI} onChange={(emoji) => set({ emoji: emoji as VoiceRules["emoji"] })} />
        <SelectField id="bv-spell" label="Spelling" value={v.spelling} disabled={d} options={SPELLING} onChange={(spelling) => set({ spelling: spelling as VoiceRules["spelling"] })} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="bv-read" label="Reading level" hint="Optional. e.g. plain English, no industry terms." value={v.readingLevel} disabled={d} maxLength={120} onChange={(readingLevel) => set({ readingLevel })} />
        <Field id="bv-cta" label="How calls to action sound" value={v.ctaStyle} disabled={d} maxLength={200} placeholder="Invite, never pressure" onChange={(ctaStyle) => set({ ctaStyle })} />
      </div>
      <LinesField id="bv-banned" label="Words to never use" hint="One per line. Drafting is told to avoid these outright." value={v.bannedWords} disabled={d} rows={3} placeholder="synergy&#10;game-changing" onChange={(bannedWords) => set({ bannedWords })} />
      <AreaField
        id="bv-ex"
        label="Posts that already sound right"
        hint={`Up to ${VL.examples}, separated by a blank line. Drafting copies the voice, never the facts.`}
        rows={6}
        disabled={d}
        value={v.examples.join("\n\n")}
        placeholder="Paste a post you were happy with.&#10;&#10;Separate each one with a blank line."
        onChange={(text) => set({ examples: fromBlocks(text, VL.examples) })}
      />
      <SaveBar canEdit={canEdit} dirty={dirty} pending={pending} label="Save voice" />
    </form>
  );
}
