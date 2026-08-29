"use client";

import { useState } from "react";
import { Button, Input, Label, Textarea } from "@wizeworks/silicaui-react";
import { deleteHashtagSet, saveHashtagSet, type HashtagSetRow } from "@/lib/actions/hashtag-sets";
import { normalizeTags, renderTags } from "@/lib/hashtags";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { ConfirmDialog } from "../confirm-dialog";

type Props = { workspaceId: string; sets: HashtagSetRow[]; networks: { key: string; label: string }[]; canEdit: boolean };
type Draft = { id?: string; name: string; tags: string; channelKinds: string[] };

const blank = (): Draft => ({ name: "", tags: "", channelKinds: [] });
const draftFrom = (s: HashtagSetRow): Draft => ({ id: s.id, name: s.name, tags: renderTags(s.tags), channelKinds: s.channelKinds });

export function HashtagSetsSettings({ workspaceId, sets, networks, canEdit }: Props) {
  const { run, pending } = useActionFeedback();
  const [draft, setDraft] = useState<Draft | null>(null);
  return (
    <div className="mt-4 flex max-w-220 flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <p className="max-w-140 text-sm leading-relaxed text-secondary">
          Saved groups of hashtags the composer can drop into a post or its first comment. Each network's own limit still applies — Create warns before a set pushes a channel over it.
        </p>
        {canEdit && !draft && <Button size="sm" color="primary" onClick={() => setDraft(blank())}>New set</Button>}
      </div>
      {draft && (
        <SetForm
          draft={draft}
          networks={networks}
          pending={pending}
          onChange={setDraft}
          onCancel={() => setDraft(null)}
          onSave={() => run(() => saveHashtagSet({ workspaceId, ...draft }), (r) => { if (!r.error) setDraft(null); })}
        />
      )}
      <SetTable sets={sets} canEdit={canEdit} pending={pending} onEdit={(s) => setDraft(draftFrom(s))} onDelete={(s) => run(() => deleteHashtagSet(workspaceId, s.id))} />
    </div>
  );
}

function SetForm({ draft, networks, pending, onChange, onSave, onCancel }: { draft: Draft; networks: Props["networks"]; pending: boolean; onChange: (d: Draft) => void; onSave: () => void; onCancel: () => void }) {
  const parsed = normalizeTags(draft.tags);
  const toggle = (key: string) => onChange({ ...draft, channelKinds: draft.channelKinds.includes(key) ? draft.channelKinds.filter((k) => k !== key) : [...draft.channelKinds, key] });
  return (
    <form className="flex flex-col gap-3 rounded-box border border-base-300 p-4" onSubmit={(e) => { e.preventDefault(); onSave(); }}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="hs-name">Name</Label>
        <Input id="hs-name" size="sm" value={draft.name} maxLength={60} onChange={(e) => onChange({ ...draft, name: e.target.value })} placeholder="e.g. Coffee shop core" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="hs-tags">Hashtags</Label>
        <Textarea id="hs-tags" rows={3} value={draft.tags} onChange={(e) => onChange({ ...draft, tags: e.target.value })} placeholder="#coffee #latteart specialty" className="text-sm" />
        <p className="text-xs text-secondary/70">{parsed.length} hashtag{parsed.length === 1 ? "" : "s"}: {renderTags(parsed) || "none yet"}</p>
      </div>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-sm font-medium">Meant for <span className="font-normal text-secondary/70">(optional)</span></legend>
        <div className="flex flex-wrap gap-1.5">
          {networks.map((n) => (
            <button key={n.key} type="button" aria-pressed={draft.channelKinds.includes(n.key)} onClick={() => toggle(n.key)} className={`rounded-field border px-2 py-1 text-xs ${draft.channelKinds.includes(n.key) ? "border-base-content font-semibold" : "border-base-300 text-secondary"}`}>{n.label}</button>
          ))}
          {networks.length === 0 && <span className="text-xs text-secondary/70">Connect an account to tag sets by network.</span>}
        </div>
      </fieldset>
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" color="neutral" onClick={onCancel}>Cancel</Button>
        <Button type="submit" size="sm" color="primary" loading={pending} disabled={!draft.name.trim() || parsed.length === 0}>Save set</Button>
      </div>
    </form>
  );
}

function SetTable({ sets, canEdit, pending, onEdit, onDelete }: { sets: HashtagSetRow[]; canEdit: boolean; pending: boolean; onEdit: (s: HashtagSetRow) => void; onDelete: (s: HashtagSetRow) => void }) {
  if (sets.length === 0) return <p className="text-sm text-secondary/70">No hashtag sets yet. A first one might be the five tags you put on every post.</p>;
  return (
    <ul className="flex flex-col divide-y divide-base-300 rounded-box border border-base-300">
      {sets.map((s) => (
        <li key={s.id} className="flex items-start gap-3 px-4 py-3">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{s.name} <span className="font-normal text-secondary/70">· {s.tags.length} tag{s.tags.length === 1 ? "" : "s"}{s.usageCount ? ` · used ${s.usageCount}×` : ""}</span></span>
            <span className="block truncate text-xs text-secondary/70">{renderTags(s.tags)}</span>
          </span>
          {canEdit && (
            <span className="flex gap-1">
              <Button size="xs" variant="outline" color="neutral" onClick={() => onEdit(s)}>Edit</Button>
              <ConfirmDialog
                trigger={<Button size="xs" variant="ghost" color="error" disabled={pending}>Delete</Button>}
                title={`Delete "${s.name}"?`}
                description="Posts that already used this set keep their hashtags."
                confirmLabel="Delete"
                onConfirm={() => onDelete(s)}
              />
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
