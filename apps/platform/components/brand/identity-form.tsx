"use client";

import { Field, LinesField, SaveBar, SectionIntro } from "./fields";
import { Repeater } from "./repeater";
import { useSectionForm } from "./use-section-form";
import type { Identity } from "@/lib/brand/types";

type Props = { workspaceId: string; initial: Identity; canEdit: boolean };

export function IdentityForm({ workspaceId, initial, canEdit }: Props) {
  const { v, set, dirty, save, pending } = useSectionForm(workspaceId, "identity", initial);
  const d = !canEdit;

  return (
    <form onSubmit={save} className="mt-4 flex max-w-180 flex-col gap-6">
      <SectionIntro>
        The facts a draft is allowed to state about the business. Drafting quotes what is here and invents nothing beyond it, so an empty field is a field a post will not mention.
      </SectionIntro>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="bi-display" label="Name used in posts" value={v.displayName} disabled={d} maxLength={120} placeholder="Ash & Oak" onChange={(displayName) => set({ displayName })} />
        <Field id="bi-legal" label="Legal name" hint="Used on client-facing documents when it differs." value={v.legalName} disabled={d} maxLength={120} placeholder="Ash & Oak Ltd" onChange={(legalName) => set({ legalName })} />
      </div>
      <Field id="bi-one" label="What the business does" hint="One sentence, the way you would say it out loud." value={v.oneLiner} disabled={d} maxLength={200} placeholder="A two-chair salon in Leeds specialising in curly hair." onChange={(oneLiner) => set({ oneLiner })} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="bi-cat" label="Category" value={v.category} disabled={d} maxLength={120} placeholder="Hair salon" onChange={(category) => set({ category })} />
        <Field id="bi-web" label="Website" type="url" value={v.website} disabled={d} maxLength={200} placeholder="https://ashandoak.co.uk" onChange={(website) => set({ website })} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <LinesField id="bi-loc" label="Locations served" value={v.locations} disabled={d} rows={3} placeholder="Leeds city centre&#10;Chapel Allerton" onChange={(locations) => set({ locations })} />
        <LinesField id="bi-lang" label="Languages" value={v.languages} disabled={d} rows={3} placeholder="English" onChange={(languages) => set({ languages })} />
      </div>
      <Repeater
        label="Links a post can point at"
        hint="Booking, menu, shop, directions. A call to action uses one of these rather than a made-up URL."
        rows={v.links}
        blank={{ label: "", url: "" }}
        max={12}
        canEdit={canEdit}
        addLabel="Add link"
        onChange={(links) => set({ links })}
        render={(row, setRow, i) => (
          <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
            <Field id={`bi-ll-${i}`} label="Label" value={row.label} disabled={d} maxLength={120} placeholder="Book now" onChange={(label) => setRow({ label })} />
            <Field id={`bi-lu-${i}`} label="URL" type="url" value={row.url} disabled={d} maxLength={200} placeholder="https://" onChange={(url) => setRow({ url })} />
          </div>
        )}
      />
      <SaveBar canEdit={canEdit} dirty={dirty} pending={pending} label="Save identity" />
    </form>
  );
}
