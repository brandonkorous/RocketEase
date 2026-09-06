"use client";

import { useState } from "react";
import { Input, Switch } from "@wizeworks/silicaui-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { removeLink, updateLink } from "@/lib/actions/bio/links";
import type { EditorLink } from "@/lib/bio/queries";
import { displayUrl } from "@/lib/bio/rules";
import { useActionFeedback } from "@/lib/use-action-feedback";

type Props = {
  workspaceId: string;
  link: EditorLink;
  canEdit: boolean;
  limits: { title: number; url: number };
  drag: { onDragStart: () => void; onDragEnd: () => void; onDragOver: (e: React.DragEvent) => void; onDrop: () => void; dragging: boolean; over: boolean };
  onMove: (dir: -1 | 1) => void;
};

const GripIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" /></svg>
);
const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
);

/** One link: drag to reorder (arrow keys on the grip do the same), title and address save on blur, the switch hides without deleting. */
export function LinkRow({ workspaceId, link, canEdit, limits, drag, onMove }: Props) {
  const { run, pending } = useActionFeedback();
  const [title, setTitle] = useState(link.title);
  const [url, setUrl] = useState(displayUrl(link.url));
  const d = !canEdit || pending;
  const save = (patch: { title?: string; url?: string; enabled?: boolean }) => run(() => updateLink({ workspaceId, linkId: link.id, ...patch }));
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowUp") { e.preventDefault(); onMove(-1); }
    if (e.key === "ArrowDown") { e.preventDefault(); onMove(1); }
  };
  return (
    <li
      draggable={canEdit}
      onDragStart={drag.onDragStart}
      onDragEnd={drag.onDragEnd}
      onDragOver={drag.onDragOver}
      onDrop={drag.onDrop}
      className={`grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-3 rounded-box border p-3 md:grid-cols-[20px_minmax(0,1fr)_104px_36px_28px] ${link.enabled ? "bg-base-100" : "bg-base-200/60"} ${drag.over ? "border-base-content" : "border-base-300"} ${drag.dragging ? "opacity-50" : ""}`}
    >
      <button type="button" className="cursor-grab text-secondary/70 disabled:cursor-default" aria-label={`Move ${link.title || "link"} (arrow keys)`} disabled={!canEdit} onKeyDown={onKey}><GripIcon /></button>
      <div className="flex min-w-0 flex-col gap-1.5">
        <Input size="sm" value={title} maxLength={limits.title} placeholder="Title people tap" disabled={d} aria-label="Link title" onChange={(e) => setTitle(e.target.value)} onBlur={() => { if (title !== link.title) save({ title }); }} />
        <Input size="sm" value={url} maxLength={limits.url} placeholder="example.com/page" disabled={d} aria-label="Link address" className="text-secondary" onChange={(e) => setUrl(e.target.value)} onBlur={() => { if (url !== displayUrl(link.url)) save({ url }); }} />
      </div>
      <div className="col-start-2 flex flex-col text-right tabular-nums md:col-start-auto">
        <span className="text-base font-semibold leading-5">{link.clicks.week}</span>
        <span className="text-xs leading-4 text-secondary">last 7 days</span>
        <span className="text-xs leading-4 text-secondary">{link.clicks.all.toLocaleString()} all time</span>
      </div>
      <Switch checked={link.enabled} disabled={d} onCheckedChange={(v: boolean) => save({ enabled: v })} aria-label={`${link.title || "Link"} shown`} />
      <ConfirmDialog
        trigger={<button type="button" className="flex h-7 w-7 items-center justify-center rounded-field text-secondary hover:bg-base-200 disabled:opacity-50" aria-label={`Remove ${link.title || "link"}`} disabled={d}><TrashIcon /></button>}
        title="Remove this link?"
        description={`“${link.title || "Untitled"}” and its ${link.clicks.all.toLocaleString()} recorded clicks are removed. Switch it off instead to hide it and keep the counts.`}
        confirmLabel="Remove"
        onConfirm={() => run(() => removeLink(workspaceId, link.id))}
      />
    </li>
  );
}
