"use client";

import { useState } from "react";
import { Button, Input, Label } from "@wizeworks/silicaui-react";
import type { TrackingSettings as Tracking } from "@/lib/actions/settings/catalog";
import { setTrackingSettings } from "@/lib/actions/settings/tracking";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { TrackingSources, type TrackingSourcesProps } from "./tracking-sources";

type Props = { workspaceId: string; initial: Tracking; canEdit: boolean; sources: TrackingSourcesProps["sources"]; enabled: TrackingSourcesProps["enabled"] };

const UTM: { key: keyof Tracking; label: string; hint: string }[] = [
  { key: "utmSource", label: "utm_source", hint: "Where traffic comes from, e.g. instagram. Leave blank to use the channel's network name." },
  { key: "utmMedium", label: "utm_medium", hint: "Usually \"social\"." },
  { key: "utmCampaign", label: "utm_campaign", hint: "Default campaign name; a post's campaign overrides it." },
];

/** UTM defaults the composer pre-fills, plus the conversion sources those UTMs are matched against. */
export function TrackingSettings({ workspaceId, initial, canEdit, sources, enabled }: Props) {
  const { run, pending } = useActionFeedback();
  const [v, setV] = useState<Tracking>(initial);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  const save = (e: React.FormEvent) => { e.preventDefault(); run(() => setTrackingSettings({ workspaceId, ...v })); };
  const field = (key: keyof Tracking) => ({ value: v[key], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [key]: e.target.value }), disabled: !canEdit });
  return (
    <div className="mt-4 flex max-w-180 flex-col gap-8">
      <TrackingSources workspaceId={workspaceId} sources={sources} canEdit={canEdit} enabled={enabled} />
      <form onSubmit={save} className="flex flex-col gap-8">
        <section aria-labelledby="utm-h">
          <h3 id="utm-h" className="text-base font-semibold">UTM defaults</h3>
          <p className="mt-1 text-sm leading-relaxed text-secondary">Pre-filled in the composer's UTM section for every new post with a link. Editors can still change them per post.</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            {UTM.map((u) => (<div key={u.key} className="flex flex-col gap-1.5"><Label htmlFor={u.key}>{u.label}</Label><Input id={u.key} size="sm" {...field(u.key)} placeholder={u.label} /><span className="text-xs text-secondary/70">{u.hint}</span></div>))}
          </div>
        </section>
        {canEdit ? <div><Button type="submit" color="primary" loading={pending} disabled={!dirty}>Save tracking defaults</Button></div> : <p className="text-xs text-secondary/70">Only owners and admins can change tracking settings.</p>}
      </form>
    </div>
  );
}
