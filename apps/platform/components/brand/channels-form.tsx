"use client";

import type { ChannelPresence } from "@/lib/brand/types";
import { AreaField, Field, SaveBar, SectionIntro } from "./fields";
import { useSectionForm } from "./use-section-form";

type Values = { channels: ChannelPresence[] };
export type NetworkOption = { network: string; label: string };
type Props = { workspaceId: string; initial: ChannelPresence[]; networks: NetworkOption[]; canEdit: boolean };

/** One row per connected network, so the list can never drift from the accounts that exist. */
export function ChannelsForm({ workspaceId, initial, networks, canEdit }: Props) {
  const rows = networks.map((n) => initial.find((c) => c.network === n.network) ?? { network: n.network, handle: "", bio: "", linkInBio: "", notes: "" });
  const { v, set, dirty, save, pending } = useSectionForm<Values>(workspaceId, "channels", { channels: rows });
  const d = !canEdit;
  const update = (network: string, patch: Partial<ChannelPresence>) => set({ channels: v.channels.map((c) => (c.network === network ? { ...c, ...patch } : c)) });

  return (
    <form onSubmit={save} className="mt-4 flex max-w-180 flex-col gap-6">
      <SectionIntro>
        The profile copy that lives on each network. Kept here so a bio rewrite does not mean logging into four apps to find the current one.
      </SectionIntro>
      {!networks.length && <p className="text-sm text-secondary/70">Connect an account first — these fields follow the channels this workspace actually has.</p>}
      {v.channels.map((c) => (
        <section key={c.network} className="flex flex-col gap-3 rounded-box border border-base-300 p-4" aria-labelledby={`bc-${c.network}`}>
          <h3 id={`bc-${c.network}`} className="text-base font-semibold">{networks.find((n) => n.network === c.network)?.label ?? c.network}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id={`bc-h-${c.network}`} label="Handle" value={c.handle} disabled={d} maxLength={120} placeholder="@ashandoak" onChange={(handle) => update(c.network, { handle })} />
            <Field id={`bc-l-${c.network}`} label="Link in bio" type="url" value={c.linkInBio} disabled={d} maxLength={200} placeholder="https://" onChange={(linkInBio) => update(c.network, { linkInBio })} />
          </div>
          <AreaField id={`bc-b-${c.network}`} label="Bio" rows={3} disabled={d} maxLength={2000} value={c.bio} onChange={(bio) => update(c.network, { bio })} />
          <Field id={`bc-n-${c.network}`} label="Notes" value={c.notes} disabled={d} maxLength={300} placeholder="Pinned post refreshed every quarter" onChange={(notes) => update(c.network, { notes })} />
        </section>
      ))}
      <SaveBar canEdit={canEdit} dirty={dirty} pending={pending} label="Save channel presence" />
    </form>
  );
}
