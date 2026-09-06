"use client";

import { useState } from "react";
import { Button } from "@wizeworks/silicaui-react";
import { addLink, reorderLinks } from "@/lib/actions/bio/links";
import type { EditorData } from "@/lib/bio/queries";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { Card, Hint } from "./card";
import { LinkRow } from "./link-row";

const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
);

/** The ordered list. Reordering posts the whole order, so a dropped drag and an arrow key end in the same place. */
export function LinksCard({ data }: { data: EditorData }) {
  const { run, pending } = useActionFeedback();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const ids = data.links.map((l) => l.id);
  const commit = (order: string[]) => { if (order.join() !== ids.join()) run(() => reorderLinks(data.workspaceId, order)); };
  const moveTo = (id: string, targetIndex: number) => {
    const rest = ids.filter((x) => x !== id);
    rest.splice(Math.max(0, Math.min(rest.length, targetIndex)), 0, id);
    commit(rest);
  };
  const drop = (targetId: string) => {
    if (dragId && dragId !== targetId) moveTo(dragId, ids.indexOf(targetId));
    setDragId(null);
    setOverId(null);
  };
  const full = data.links.length >= data.limits.links;
  return (
    <Card title="Links" aside={<span className="text-xs text-secondary">Drag to reorder · switch off to hide without deleting</span>}>
      {data.links.length === 0 && <Hint>No links yet. The page shows the header alone until you add one.</Hint>}
      <ul className="flex flex-col gap-2.5">
        {data.links.map((l, i) => (
          <LinkRow
            key={l.id}
            workspaceId={data.workspaceId}
            link={l}
            canEdit={data.canEdit}
            limits={data.limits}
            drag={{ onDragStart: () => setDragId(l.id), onDragEnd: () => { setDragId(null); setOverId(null); }, onDragOver: (e) => { e.preventDefault(); setOverId(l.id); }, onDrop: () => drop(l.id), dragging: dragId === l.id, over: overId === l.id && dragId !== l.id }}
            onMove={(dir) => moveTo(l.id, i + dir)}
          />
        ))}
      </ul>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Button size="sm" variant="outline" color="neutral" disabled={!data.canEdit || pending || full} onClick={() => run(() => addLink(data.workspaceId))}><PlusIcon />Add link</Button>
        <Hint>Clicks are counted by RocketEase when someone opens a link from this page. One click, one count; nothing is deduplicated. “Last 7 days” is the last 7 × 24 hours. Up to {data.limits.links} links{full ? " — the page is full" : ""}.</Hint>
      </div>
    </Card>
  );
}
