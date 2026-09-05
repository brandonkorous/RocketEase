"use client";

import Link from "next/link";
import type { GridData } from "@/lib/grid/types";
import { workspacePath } from "@/lib/nav";
import type { Drag } from "./preview";

type Props = { data: GridData; setDrag: (d: Drag | null) => void };

/** Drafts with a destination on this channel and no date. Drop one on a gap to schedule it. */
export function DraftsTray({ data, setDrag }: Props) {
  const drag = data.canPublish;
  return (
    <section className="rounded-box border border-base-300 p-4" aria-labelledby="drafts-h">
      <h2 id="drafts-h" className="text-sm font-semibold">Unscheduled drafts <span className="font-normal text-secondary/70">({data.drafts.length})</span></h2>
      <ul className="mt-2 flex flex-col divide-y divide-base-300">
        {data.drafts.map((d) => (
          <li key={d.itemId}>
            <Link
              href={workspacePath(data.workspaceId, `create?item=${d.itemId}`)}
              draggable={drag}
              onDragStart={() => setDrag({ kind: "draft", itemId: d.itemId, title: d.title })}
              onDragEnd={() => setDrag(null)}
              className={`block py-2 hover:bg-base-200 ${drag ? "cursor-grab" : ""}`}
            >
              <span className="block truncate text-sm font-medium">{d.title}</span>
              <span className="block truncate text-xs text-secondary/70">{d.text || "No text yet"}</span>
            </Link>
          </li>
        ))}
        {data.drafts.length === 0 && <li className="py-2 text-xs text-secondary/70">Every draft for this profile has a date.</li>}
      </ul>
      {drag && data.drafts.length > 0 && <p className="mt-2 text-xs text-secondary">Drop a draft on a gap to schedule it at your usual time.</p>}
    </section>
  );
}
