"use client";

import { useState } from "react";
import { Button, Input } from "@wizeworks/silicaui-react";
import { createFolder } from "@/lib/actions/folders";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { LibIcon } from "./icons";
import type { LibraryData } from "./types";

type Nav = (patch: Record<string, string | null>) => void;

export function CollectionsRail({ data, nav }: { data: LibraryData; nav: Nav }) {
  const { query, canEdit } = data;
  const [adding, setAdding] = useState(false);
  const { run, pending } = useActionFeedback();
  return (
    <aside className="border-b border-base-300 p-4 md:border-b-0 md:border-r">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Collections</h2>
        {canEdit && <button type="button" className="text-lg leading-none text-secondary/70 hover:text-base-content" aria-label="New collection" onClick={() => setAdding(true)}>+</button>}
      </div>
      {adding && (
        <form className="mt-2 flex gap-1" onSubmit={(e) => { e.preventDefault(); const name = String(new FormData(e.currentTarget).get("name")); run(() => createFolder(data.workspaceId, name), () => setAdding(false)); }}>
          <Input name="name" size="sm" placeholder="Name" autoFocus required /><Button type="submit" size="sm" color="primary" loading={pending}>Add</Button>
        </form>
      )}
      <ul className="mt-2 flex flex-col">
        <li><RailItem active={!query.folder && !query.smart} label="All Collections" n={data.tabs.all} onClick={() => nav({ folder: null, smart: null })} /></li>
        {data.collections.map((c) => (<li key={c.id}><RailItem active={query.folder === c.id} label={c.name} n={c.count} onClick={() => nav({ folder: c.id, smart: null })} /></li>))}
        {data.collections.length === 0 && <li className="px-2 py-1.5 text-xs text-secondary/70">No collections yet.</li>}
      </ul>
      <h2 className="mt-6 flex items-center gap-1.5 text-sm font-semibold">Smart Collections <span className="text-secondary/70">{LibIcon.sparkle}</span></h2>
      <ul className="mt-2 flex flex-col">
        <li><RailItem icon={LibIcon.clock} active={query.smart === "used"} label="Recently Used" n={data.smart.used} onClick={() => nav({ smart: "used", folder: null })} /></li>
        <li><RailItem icon={LibIcon.sparkle} active={false} label="Top Performing" hint="after analytics" onClick={() => {}} /></li>
        <li><RailItem icon={LibIcon.clock} active={query.smart === "review"} label="Needs Review" n={data.smart.review} onClick={() => nav({ smart: "review", folder: null })} /></li>
        <li><RailItem icon={LibIcon.clock} active={query.smart === "expiring"} label="Expiring Soon" n={data.smart.expiring} onClick={() => nav({ smart: "expiring", folder: null })} /></li>
        <li><RailItem icon={LibIcon.img} active={query.smart === "unused"} label="Unused Assets" n={data.smart.unused} onClick={() => nav({ smart: "unused", folder: null })} /></li>
      </ul>
    </aside>
  );
}

function RailItem({ label, n, active, onClick, icon, hint }: { label: string; n?: number; active: boolean; onClick: () => void; icon?: React.ReactNode; hint?: string }) {
  return (
    <button type="button" onClick={onClick} className={`flex w-full items-center gap-2 rounded-field px-2 py-1.5 text-left text-sm ${active ? "bg-base-200 font-semibold" : "text-secondary hover:bg-base-200"}`} title={hint}>
      {icon && <span className="text-secondary/70">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {n !== undefined && <span className="text-xs text-secondary/70">{n}</span>}
      {hint && <span className="text-xs text-secondary/50">soon</span>}
    </button>
  );
}
