"use client";

import { SWATCH_LABEL, SWATCH_ROLES, type Swatch, type Visual } from "@/lib/brand/types";
import { isHex } from "@/lib/brand/read";
import { AreaField, Field, LinesField, SaveBar, SectionIntro, SelectField } from "./fields";
import { Repeater } from "./repeater";
import { useSectionForm } from "./use-section-form";

type Values = Omit<Visual, "logos">;
type Props = { workspaceId: string; initial: Visual; canEdit: boolean };

const ROLE_OPTIONS = SWATCH_ROLES.map((r) => ({ value: r, label: SWATCH_LABEL[r] }));
const BLANK: Swatch = { name: "", hex: "#000000", role: "primary", note: "" };

/** The only place a customer's colour is rendered: data, not app chrome. */
function SwatchPreview({ hex }: { hex: string }) {
  const valid = isHex(hex);
  return (
    <span
      aria-hidden
      className="mt-6 h-9 w-9 shrink-0 rounded-field border border-base-300"
      style={valid ? { backgroundColor: hex } : undefined}
    />
  );
}

export function VisualForm({ workspaceId, initial, canEdit }: Props) {
  const { logos: _logos, ...rest } = initial;
  const { v, set, dirty, save, pending } = useSectionForm<Values>(workspaceId, "visual", rest);
  const d = !canEdit;

  return (
    <form onSubmit={save} className="mt-6 flex max-w-180 flex-col gap-8">
      <Repeater
        label="Colour palette"
        hint="Hex values with the job each colour does. Generated images are told to work within these; anyone making creative outside the product copies them from here."
        rows={v.palette}
        blank={BLANK}
        max={12}
        canEdit={canEdit}
        addLabel="Add colour"
        onChange={(palette) => set({ palette })}
        render={(row, setRow, i) => (
          <div className="flex gap-3">
            <SwatchPreview hex={row.hex} />
            <div className="grid flex-1 gap-3 sm:grid-cols-3">
              <Field id={`bp-name-${i}`} label="Name" value={row.name} disabled={d} maxLength={120} placeholder="Ink" onChange={(name) => setRow({ name })} />
              <Field id={`bp-hex-${i}`} label="Hex" hint={isHex(row.hex) ? undefined : "Use #rgb or #rrggbb."} value={row.hex} disabled={d} maxLength={9} placeholder="#0a0a0a" onChange={(hex) => setRow({ hex })} />
              <SelectField id={`bp-role-${i}`} label="Role" value={row.role} disabled={d} options={ROLE_OPTIONS} onChange={(role) => setRow({ role: role as Swatch["role"] })} />
            </div>
          </div>
        )}
      />

      <section className="flex flex-col gap-4" aria-labelledby="bt-h">
        <div>
          <h3 id="bt-h" className="text-base font-semibold">Typography</h3>
          <SectionIntro>Family names, not files. Record the licence so nobody has to guess whether a freelancer may use them.</SectionIntro>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="bt-head" label="Headings" value={v.typography.headingFamily} disabled={d} maxLength={120} placeholder="Söhne" onChange={(headingFamily) => set({ typography: { ...v.typography, headingFamily } })} />
          <Field id="bt-body" label="Body" value={v.typography.bodyFamily} disabled={d} maxLength={120} placeholder="Inter" onChange={(bodyFamily) => set({ typography: { ...v.typography, bodyFamily } })} />
          <Field id="bt-weight" label="Weights in use" value={v.typography.weights} disabled={d} maxLength={120} placeholder="400, 600" onChange={(weights) => set({ typography: { ...v.typography, weights } })} />
          <Field id="bt-lic" label="Licence note" value={v.typography.licenceNote} disabled={d} maxLength={300} placeholder="Adobe Fonts, agency seat — not for client redistribution" onChange={(licenceNote) => set({ typography: { ...v.typography, licenceNote } })} />
        </div>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="bim-h">
        <div>
          <h3 id="bim-h" className="text-base font-semibold">Imagery direction</h3>
          <SectionIntro>What photography and generated images should look like. This is appended to every image prompt from this workspace.</SectionIntro>
        </div>
        <AreaField id="bim-style" label="House style" rows={4} disabled={d} maxLength={2000} value={v.imagery.style} placeholder="Natural light, real customers, shallow depth of field. Nothing staged." onChange={(style) => set({ imagery: { ...v.imagery, style } })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <LinesField id="bim-do" label="Always" value={v.imagery.doList} disabled={d} rows={3} onChange={(doList) => set({ imagery: { ...v.imagery, doList } })} />
          <LinesField id="bim-dont" label="Never" value={v.imagery.dontList} disabled={d} rows={3} onChange={(dontList) => set({ imagery: { ...v.imagery, dontList } })} />
        </div>
        <LinesField id="bim-avoid" label="Keep out of frame" hint="One per line. Props, competitor products, anything you can't show." value={v.imagery.avoid} disabled={d} rows={3} onChange={(avoid) => set({ imagery: { ...v.imagery, avoid } })} />
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="bl-clear" label="Logo clear space" value={v.clearSpace} disabled={d} maxLength={300} placeholder="Height of the mark on every side" onChange={(clearSpace) => set({ clearSpace })} />
        <Field id="bl-min" label="Minimum size" value={v.minSize} disabled={d} maxLength={300} placeholder="24px on screen, 10mm in print" onChange={(minSize) => set({ minSize })} />
      </div>

      <SaveBar canEdit={canEdit} dirty={dirty} pending={pending} label="Save visual identity" />
    </form>
  );
}
