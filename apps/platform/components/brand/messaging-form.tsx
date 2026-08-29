"use client";

import type { Messaging } from "@/lib/brand/types";
import { AreaField, Field, LinesField, SaveBar, SectionIntro } from "./fields";
import { Repeater } from "./repeater";
import { useSectionForm } from "./use-section-form";

type Props = { workspaceId: string; initial: Messaging; canEdit: boolean };

export function MessagingForm({ workspaceId, initial, canEdit }: Props) {
  const { v, set, dirty, save, pending } = useSectionForm(workspaceId, "messaging", initial);
  const d = !canEdit;

  return (
    <form onSubmit={save} className="mt-4 flex max-w-180 flex-col gap-8">
      <SectionIntro>
        Claims the team has already signed off. Drafting may use anything here without it being repeated in the brief — so everything here has to be true, and stay true.
      </SectionIntro>

      <AreaField id="bm-boiler" label="Boilerplate" hint="The approved paragraph about the business. Used for bios, ad copy, and client reports." rows={4} disabled={d} maxLength={2000} value={v.boilerplate} onChange={(boilerplate) => set({ boilerplate })} />

      <div className="grid gap-4 sm:grid-cols-2">
        <LinesField id="bm-tag" label="Taglines" hint="One per line. Used verbatim or not at all." value={v.taglines} disabled={d} onChange={(taglines) => set({ taglines })} />
        <LinesField id="bm-vp" label="Value propositions" hint="One per line. What the business is actually good at." value={v.valueProps} disabled={d} onChange={(valueProps) => set({ valueProps })} />
      </div>

      <LinesField id="bm-proof" label="Proof points" hint="One per line. Only what you can evidence — anything here can end up in an ad." value={v.proofPoints} disabled={d} rows={4} onChange={(proofPoints) => set({ proofPoints })} />

      <Repeater
        label="Live offers"
        hint="An offer with a date stops being used the day after it expires. Nothing invents a discount that is not listed here or in the brief."
        rows={v.offers}
        blank={{ name: "", detail: "", expiresAt: "" }}
        max={8}
        canEdit={canEdit}
        addLabel="Add offer"
        onChange={(offers) => set({ offers })}
        render={(row, setRow, i) => (
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_160px]">
            <Field id={`bm-on-${i}`} label="Name" value={row.name} disabled={d} maxLength={120} placeholder="Midweek 20%" onChange={(name) => setRow({ name })} />
            <Field id={`bm-od-${i}`} label="Wording to use" value={row.detail} disabled={d} maxLength={200} placeholder="20% off Tuesday to Thursday" onChange={(detail) => setRow({ detail })} />
            <Field id={`bm-oe-${i}`} label="Ends" type="date" value={row.expiresAt} disabled={d} onChange={(expiresAt) => setRow({ expiresAt })} />
          </div>
        )}
      />

      <Repeater
        label="Questions customers ask"
        hint="Answers a post or a reply can draw on."
        rows={v.faqs}
        blank={{ question: "", answer: "" }}
        max={12}
        canEdit={canEdit}
        addLabel="Add question"
        onChange={(faqs) => set({ faqs })}
        render={(row, setRow, i) => (
          <div className="flex flex-col gap-3">
            <Field id={`bm-fq-${i}`} label="Question" value={row.question} disabled={d} maxLength={200} onChange={(question) => setRow({ question })} />
            <AreaField id={`bm-fa-${i}`} label="Answer" rows={3} disabled={d} maxLength={2000} value={row.answer} onChange={(answer) => setRow({ answer })} />
          </div>
        )}
      />

      <SaveBar canEdit={canEdit} dirty={dirty} pending={pending} label="Save messaging" />
    </form>
  );
}
