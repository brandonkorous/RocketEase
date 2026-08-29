"use client";

import type { Audience } from "@/lib/brand/types";
import { AreaField, Field, LinesField, SaveBar, SectionIntro } from "./fields";
import { Repeater } from "./repeater";
import { useSectionForm } from "./use-section-form";

type Values = { audiences: Audience[] };
type Props = { workspaceId: string; initial: Audience[]; canEdit: boolean };

const BLANK: Audience = { name: "", description: "", pains: [], words: [], channels: [] };

export function AudiencesForm({ workspaceId, initial, canEdit }: Props) {
  const { v, set, dirty, save, pending } = useSectionForm<Values>(workspaceId, "audiences", { audiences: initial });
  const d = !canEdit;

  return (
    <form onSubmit={save} className="mt-4 flex max-w-180 flex-col gap-6">
      <SectionIntro>
        Who each post is angled at. Concepts written for a named reader beat concepts written for everyone — this is what gives two concepts genuinely different angles instead of different wording.
      </SectionIntro>
      <Repeater
        label="Audiences"
        rows={v.audiences}
        blank={BLANK}
        max={6}
        canEdit={canEdit}
        addLabel="Add audience"
        onChange={(audiences) => set({ audiences })}
        render={(row, setRow, i) => (
          <div className="flex flex-col gap-3">
            <Field id={`ba-n-${i}`} label="Name" value={row.name} disabled={d} maxLength={120} placeholder="First-time customers" onChange={(name) => setRow({ name })} />
            <AreaField id={`ba-d-${i}`} label="Who they are" rows={3} disabled={d} maxLength={2000} value={row.description} onChange={(description) => setRow({ description })} />
            <div className="grid gap-3 sm:grid-cols-3">
              <LinesField id={`ba-p-${i}`} label="What they struggle with" value={row.pains} disabled={d} rows={3} onChange={(pains) => setRow({ pains })} />
              <LinesField id={`ba-w-${i}`} label="Words they use" value={row.words} disabled={d} rows={3} onChange={(words) => setRow({ words })} />
              <LinesField id={`ba-c-${i}`} label="Where they are" value={row.channels} disabled={d} rows={3} onChange={(channels) => setRow({ channels })} />
            </div>
          </div>
        )}
      />
      <SaveBar canEdit={canEdit} dirty={dirty} pending={pending} label="Save audiences" />
    </form>
  );
}
