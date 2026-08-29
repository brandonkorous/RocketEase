"use client";

import Link from "next/link";
import type { BrandAssets } from "@/lib/brand/types";
import type { AssetView } from "@/lib/brand/view-types";
import { Field, SaveBar, SectionIntro } from "./fields";
import { Repeater } from "./repeater";
import { useSectionForm } from "./use-section-form";

type Props = { workspaceId: string; initial: BrandAssets; library: AssetView[]; libraryHref: string; canEdit: boolean };

function Card({ a, picked, onToggle, canEdit }: { a: AssetView; picked: boolean; onToggle: () => void; canEdit: boolean }) {
  return (
    <li>
      <button type="button" disabled={!canEdit} onClick={onToggle} aria-pressed={picked} className={`flex w-full flex-col gap-1 rounded-box border p-2 text-left ${picked ? "border-neutral bg-base-200" : "border-base-300"}`}>
        <span className="flex h-24 items-center justify-center overflow-hidden rounded-field bg-base-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {a.url ? <img src={a.url} alt="" className="h-full w-full object-cover" /> : <span className="text-xs text-secondary/70">No preview</span>}
        </span>
        <span className="truncate text-xs font-medium">{a.title}</span>
        <span className="text-xs text-secondary/70">{a.expired ? "Rights expired" : (a.rights ?? "Rights: both")}</span>
      </button>
    </li>
  );
}

/** Brand assets are ordinary library assets, flagged — so rights, scanning, and expiry keep working. */
export function AssetsForm({ workspaceId, initial, library, libraryHref, canEdit }: Props) {
  const { v, set, dirty, save, pending } = useSectionForm(workspaceId, "assets", initial);
  const picked = new Set(v.assetIds);
  const toggle = (id: string) => set({ assetIds: picked.has(id) ? v.assetIds.filter((x) => x !== id) : [...v.assetIds, id] });

  return (
    <form onSubmit={save} className="mt-4 flex max-w-240 flex-col gap-8">
      <SectionIntro>
        The media anyone making a post should reach for first — product shots, headshots, b-roll. These are library assets, so rights and expiry are the ones already recorded there; an asset whose rights have lapsed still cannot be published.
      </SectionIntro>

      <section className="flex flex-col gap-3" aria-labelledby="bas-h">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h3 id="bas-h" className="text-base font-semibold">From the content library</h3>
            <p className="mt-1 text-sm text-secondary">{v.assetIds.length} marked as brand assets.</p>
          </div>
          <Link href={libraryHref} className="text-sm font-medium underline underline-offset-2">Open library</Link>
        </div>
        {library.length === 0 ? (
          <p className="text-sm text-secondary/70">Nothing in the library yet. Upload there first, then mark the brand ones here.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {library.map((a) => (
              <Card key={a.id} a={a} picked={picked.has(a.id)} canEdit={canEdit} onToggle={() => toggle(a.id)} />
            ))}
          </ul>
        )}
      </section>

      <Repeater
        label="Media that lives elsewhere"
        hint="A link to a shared drive, a press kit, or a design file. RocketEase does not sync these — it records where they are."
        rows={v.links}
        blank={{ label: "", url: "" }}
        max={12}
        canEdit={canEdit}
        addLabel="Add link"
        onChange={(links) => set({ links })}
        render={(row, setRow, i) => (
          <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
            <Field id={`bal-l-${i}`} label="Label" value={row.label} disabled={!canEdit} maxLength={120} placeholder="Product photography" onChange={(label) => setRow({ label })} />
            <Field id={`bal-u-${i}`} label="URL" type="url" value={row.url} disabled={!canEdit} maxLength={200} placeholder="https://" onChange={(url) => setRow({ url })} />
          </div>
        )}
      />

      <SaveBar canEdit={canEdit} dirty={dirty} pending={pending} label="Save brand assets" />
    </form>
  );
}
