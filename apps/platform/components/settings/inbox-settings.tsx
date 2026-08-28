"use client";

import { useState } from "react";
import { Button, Input, Label } from "@wizeworks/silicaui-react";
import { setFirstResponseTarget } from "@/lib/actions/settings/inbox";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { SavedReplies, type SavedReplyRow } from "./saved-replies";

type Props = { workspaceId: string; minutes: number; replies: SavedReplyRow[]; canEdit: boolean; canHandle: boolean };

const PRESETS = [{ label: "15 min", value: 15 }, { label: "1 hour", value: 60 }, { label: "4 hours", value: 240 }, { label: "1 day", value: 1440 }];

export function InboxSettings({ workspaceId, minutes, replies, canEdit, canHandle }: Props) {
  const { run, pending } = useActionFeedback();
  const [value, setValue] = useState(String(minutes));
  const save = (e: React.FormEvent) => { e.preventDefault(); run(() => setFirstResponseTarget({ workspaceId, minutes: Number(value) })); };
  return (
    <div className="mt-4 flex max-w-180 flex-col gap-8">
      <section aria-labelledby="rt-h">
        <h3 id="rt-h" className="text-base font-semibold">First-response target</h3>
        <p className="mt-1 text-sm leading-relaxed text-secondary">How quickly your team aims to send a first reply. New conversations get a due time from this; overdue ones are flagged in the inbox and counted in stats.</p>
        <form onSubmit={save} className="mt-3 flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1.5"><Label htmlFor="rt-min">Minutes</Label><Input id="rt-min" type="number" size="sm" min={5} max={10_080} value={value} onChange={(e) => setValue(e.target.value)} disabled={!canEdit} className="w-32" /></div>
          <div className="flex gap-1">{PRESETS.map((p) => (<Button key={p.value} type="button" size="sm" variant={Number(value) === p.value ? "solid" : "outline"} color="neutral" disabled={!canEdit} onClick={() => setValue(String(p.value))}>{p.label}</Button>))}</div>
          {canEdit && <Button type="submit" size="sm" color="primary" loading={pending} disabled={Number(value) === minutes}>Save</Button>}
        </form>
        {!canEdit && <p className="mt-2 text-xs text-secondary/70">Only owners and admins can change the target.</p>}
      </section>
      <SavedReplies workspaceId={workspaceId} replies={replies} canHandle={canHandle} />
    </div>
  );
}
