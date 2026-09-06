"use client";

import { updateBioPage } from "@/lib/actions/bio/page";
import type { ButtonStyle } from "@/db/schema/bio";
import type { EditorData } from "@/lib/bio/queries";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { Card, Hint, Label } from "./card";

const CheckIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4.5 4.5L19 7" /></svg>
);

/** Button colour: black by rule, or the kit's primary. Text stays black on white; only the buttons take the colour. */
export function LookCard({ data }: { data: EditorData }) {
  const page = data.page!;
  const { run, pending } = useActionFeedback();
  const d = !data.canEdit || pending;
  const choose = (buttonStyle: ButtonStyle) => run(() => updateBioPage({ workspaceId: data.workspaceId, buttonStyle }));
  const option = (style: ButtonStyle, swatch: string, label: string, disabled = false) => {
    const on = page.buttonStyle === style;
    return (
      <button type="button" role="radio" aria-checked={on} disabled={d || disabled} onClick={() => choose(style)} className={`inline-flex h-9 items-center gap-2 rounded-field border px-3 text-sm ${on ? "border-base-content font-semibold" : "border-base-300 text-secondary"} disabled:opacity-50`}>
        <span className="h-3.5 w-3.5 rounded-sm border border-base-300" style={{ background: swatch }} aria-hidden="true" />
        {label}
        {on && <CheckIcon />}
      </button>
    );
  };
  return (
    <Card title="Look">
      <div className="flex flex-col gap-1.5">
        <Label>Buttons</Label>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Button colour">
          {option("black", "#0a0a0a", "Black")}
          {option("brand", data.primary?.hex ?? "#e5e5e5", data.primary ? `Brand primary · ${data.primary.name}` : "Brand primary (no palette yet)", !data.primary)}
        </div>
        <Hint>{data.primary ? "The second choice comes from Brand › Visual identity › Palette. Text stays black on white; only the buttons take the colour." : "Add a primary colour under Brand › Visual identity › Palette to offer it here."}</Hint>
      </div>
    </Card>
  );
}
