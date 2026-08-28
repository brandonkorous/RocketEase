"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@wizeworks/silicaui-react";
import { workspacePath } from "@/lib/nav";
import type { ComposerAsset } from "./types";

type Props = { assets: ComposerAsset[]; selected: string[]; onChange: (ids: string[]) => void; onClose: () => void; workspaceId: string };

export function MediaPicker({ assets, selected, onChange, onClose, workspaceId }: Props) {
  const [local, setLocal] = useState<string[]>(selected);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const toggle = (id: string) => setLocal((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="picker-h" className="flex max-h-11/12 w-full max-w-215 flex-col rounded-box border border-base-300 bg-base-100" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-base-300 px-5 py-4">
          <h2 id="picker-h" className="text-base font-semibold">Add media <span className="font-normal text-secondary/70">· {local.length} selected</span></h2>
          <Link href={workspacePath(workspaceId, "content")} className="text-sm font-medium hover:underline">Upload in Content Library ↗</Link>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {assets.length === 0 ? <p className="text-sm text-secondary">No ready assets yet. Upload images or videos in the Content Library first.</p> : <AssetGrid assets={assets} local={local} toggle={toggle} />}
        </div>
        <div className="flex justify-end gap-2 border-t border-base-300 px-5 py-4">
          <Button variant="ghost" color="neutral" onClick={onClose}>Cancel</Button>
          <Button color="primary" onClick={() => { onChange(local); onClose(); }}>Use {local.length} item{local.length === 1 ? "" : "s"}</Button>
        </div>
      </div>
    </div>
  );
}

function AssetGrid({ assets, local, toggle }: { assets: ComposerAsset[]; local: string[]; toggle: (id: string) => void }) {
  return (
    <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
      {assets.map((a) => {
        const idx = local.indexOf(a.id);
        return (
          <li key={a.id}>
            <button type="button" onClick={() => a.scanClean && toggle(a.id)} disabled={!a.scanClean} className={`relative block aspect-square w-full overflow-hidden rounded-lg border-2 ${idx >= 0 ? "border-base-content" : "border-transparent"} ${a.scanClean ? "" : "opacity-40"}`} aria-pressed={idx >= 0} aria-label={a.fileName}>
              {a.thumbUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={a.thumbUrl} alt={a.altText ?? ""} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center bg-base-200 text-xs uppercase text-secondary/70">{a.kind}</div>}
              {idx >= 0 && <span className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-base-content text-xs font-bold text-base-100">{idx + 1}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
