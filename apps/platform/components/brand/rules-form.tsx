"use client";

import type { Rules } from "@/lib/brand/types";
import { AreaField, Field, LinesField, SaveBar, SectionIntro, SelectField } from "./fields";
import { Repeater } from "./repeater";
import { useSectionForm } from "./use-section-form";

type Props = { workspaceId: string; initial: Rules; canEdit: boolean };

const COMPETITOR = [
  { value: "", label: "No rule set" },
  { value: "never", label: "Never refer to competitors" },
  { value: "no_names", label: "Contrast is fine, names are not" },
  { value: "allowed", label: "Competitors may be named" },
];

export function RulesForm({ workspaceId, initial, canEdit }: Props) {
  const { v, set, dirty, save, pending } = useSectionForm(workspaceId, "rules", initial);
  const d = !canEdit;

  return (
    <form onSubmit={save} className="mt-4 flex max-w-180 flex-col gap-8">
      <SectionIntro>
        What this brand is not allowed to say. These rules are given to drafting ahead of the brief, and they are the first thing to check when a post has to be defended.
      </SectionIntro>

      <Repeater
        label="Required disclaimers"
        hint="Text that has to appear, and where it applies."
        rows={v.disclaimers}
        blank={{ text: "", appliesTo: "" }}
        max={12}
        canEdit={canEdit}
        addLabel="Add disclaimer"
        onChange={(disclaimers) => set({ disclaimers })}
        render={(row, setRow, i) => (
          <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
            <Field id={`br-dt-${i}`} label="Text" value={row.text} disabled={d} maxLength={200} placeholder="Results vary. 18+." onChange={(text) => setRow({ text })} />
            <Field id={`br-da-${i}`} label="Applies to" value={row.appliesTo} disabled={d} maxLength={120} placeholder="Paid ads only" onChange={(appliesTo) => setRow({ appliesTo })} />
          </div>
        )}
      />

      <LinesField id="br-claims" label="Claims that are not allowed" hint="One per line. e.g. no medical outcomes, no earnings claims, no “best in the UK”." value={v.claimRules} disabled={d} rows={4} onChange={(claimRules) => set({ claimRules })} />

      <SelectField id="br-comp" label="Competitors" value={v.competitorPolicy} disabled={d} options={COMPETITOR} onChange={(competitorPolicy) => set({ competitorPolicy: competitorPolicy as Rules["competitorPolicy"] })} />

      <AreaField id="br-reg" label="Regulatory context" hint="The rules this industry is held to, in your own words." rows={3} disabled={d} maxLength={2000} value={v.regulatedNote} placeholder="FCA-regulated: every post mentioning returns needs the risk warning." onChange={(regulatedNote) => set({ regulatedNote })} />

      <LinesField id="br-trig" label="Send to approval when a post mentions" hint="One per line. A prompt for the team — approval routing still comes from the workspace approval policy." value={v.approvalTriggers} disabled={d} rows={3} onChange={(approvalTriggers) => set({ approvalTriggers })} />

      <SaveBar canEdit={canEdit} dirty={dirty} pending={pending} label="Save rules" />
    </form>
  );
}
