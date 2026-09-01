"use client";

import { Badge, Button, Checkbox } from "@wizeworks/silicaui-react";
import { moveAssets } from "@/lib/actions/folders";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { ExpandButton, useMediaLightbox } from "../shared/media-lightbox";
import { LibIcon } from "./icons";
import { fmtBytes, fmtDur, viewableMedia, type AssetCard, type LibraryData } from "./types";

type Nav = (patch: Record<string, string | null>) => void;
type Props = { data: LibraryData; nav: Nav; checked: Set<string>; setChecked: (s: Set<string>) => void; onDropFiles: (f: FileList) => void };

export function AssetGrid({ data, nav, checked, setChecked, onDropFiles }: Props) {
  const { run } = useActionFeedback();
  const media = viewableMedia(data.assets);
  const { open, lightbox } = useMediaLightbox(media);
  const slideOf = new Map(media.map((m, i) => [m.id, i]));
  const filtered = Boolean(data.query.q || data.query.folder || data.query.smart || data.query.tab);
  const toggleAll = (on: boolean) => setChecked(on ? new Set(data.assets.map((a) => a.id)) : new Set());
  const move = (folderId: string | null) => run(() => moveAssets(data.workspaceId, [...checked], folderId), () => setChecked(new Set()));

  return (
    <div className="min-w-0 p-4" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (data.canEdit) onDropFiles(e.dataTransfer.files); }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-sm">
          <Checkbox checked={checked.size > 0 && checked.size === data.assets.length} onChange={(e) => toggleAll(e.target.checked)} aria-label="Select all" />
          <span className="text-secondary">{checked.size} selected</span>
          {checked.size > 0 && <button type="button" className="font-medium hover:underline" onClick={() => setChecked(new Set())}>Deselect</button>}
          {checked.size > 0 && data.canEdit && (
            <select className="select select-xs w-auto" defaultValue="" onChange={(e) => e.target.value && move(e.target.value === "__root" ? null : e.target.value)} aria-label="Move selected to collection">
              <option value="">Move to…</option><option value="__root">No collection</option>{data.collections.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
          )}
        </div>
        <div className="flex items-center rounded-field border border-base-300 p-0.5"><span className="rounded-md bg-base-200 p-1.5" aria-label="Grid view">{LibIcon.grid}</span><span className="p-1.5 text-secondary/70" aria-label="List view (coming soon)">{LibIcon.list}</span></div>
      </div>
      {data.assets.length === 0 ? (
        <div className="mt-4 rounded-box border border-dashed border-base-300 py-16 text-center">
          <p className="text-base font-semibold">{filtered ? "Nothing matches" : "Your library is empty"}</p>
          <p className="mx-auto mt-1 max-w-95 text-sm text-secondary">{filtered ? "Try a different filter or collection." : "Drop images, videos, or PDFs here, or use Upload. Everything is scanned and sized for each network."}</p>
        </div>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {data.assets.map((a) => (<AssetTile key={a.id} a={a} selected={a.id === data.selected?.id} checked={checked.has(a.id)} onView={slideOf.has(a.id) ? () => open(slideOf.get(a.id)!) : null} onOpen={() => nav({ asset: a.id, page: String(data.page) })} onCheck={(on) => { const n = new Set(checked); on ? n.add(a.id) : n.delete(a.id); setChecked(n); }} />))}
        </ul>
      )}
      <Pagination data={data} nav={nav} />
      {lightbox}
    </div>
  );
}

type TileProps = { a: AssetCard; selected: boolean; checked: boolean; onOpen: () => void; onView: (() => void) | null; onCheck: (on: boolean) => void };

function AssetTile({ a, selected, checked, onOpen, onView, onCheck }: TileProps) {
  return (
    <li className={`relative overflow-hidden rounded-lg border ${selected ? "border-base-content" : "border-base-300"}`}>
      <button type="button" onClick={onOpen} className="relative block aspect-4/3 w-full bg-base-200 text-left" aria-label={`Open ${a.title ?? a.fileName}`}>
        {a.thumbUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={a.thumbUrl} alt={a.altText ?? ""} className="h-full w-full object-cover" loading="lazy" /> : <div className="flex h-full items-center justify-center text-xs font-semibold uppercase text-secondary/70">{a.uploadStatus === "ready" ? a.kind : a.uploadStatus === "failed" ? "failed" : "processing…"}</div>}
        <span className="absolute bottom-2 left-2 rounded bg-black/70 p-1 text-white">{a.kind === "video" ? LibIcon.play : LibIcon.img}</span>
        {a.kind === "video" && a.durationSeconds != null && <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white">{fmtDur(a.durationSeconds)}</span>}
        {a.scanStatus !== "clean" && <Badge size="xs" variant="soft" color={a.scanStatus === "infected" ? "error" : "warning"} className="absolute right-2 top-2">{a.scanStatus === "pending" ? "scanning" : a.scanStatus}</Badge>}
      </button>
      {onView && <ExpandButton onClick={onView} label={`View ${a.title ?? a.fileName} larger`} className="absolute left-2 top-2" />}
      <div className="flex items-start gap-2 p-2.5">
        <Checkbox checked={checked} onChange={(e) => onCheck(e.target.checked)} aria-label={`Select ${a.fileName}`} className="mt-0.5" />
        <div className="min-w-0"><div className="truncate text-sm font-medium">{a.fileName}</div><div className="text-xs text-secondary/70">{fmtBytes(a.bytes)}</div></div>
      </div>
    </li>
  );
}

function Pagination({ data, nav }: { data: LibraryData; nav: Nav }) {
  const pages = Math.max(1, Math.ceil(data.matched / data.pageSize));
  const from = data.matched === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const to = Math.min(data.matched, data.page * data.pageSize);
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-secondary">
      <span>Showing {from}–{to} of {data.matched.toLocaleString()} assets</span>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" color="neutral" disabled={data.page <= 1} onClick={() => nav({ page: String(data.page - 1) })} aria-label="Previous page">‹</Button>
        {Array.from({ length: Math.min(pages, 5) }, (_, i) => i + 1).map((p) => (<Button key={p} size="sm" variant={p === data.page ? "outline" : "ghost"} color="neutral" onClick={() => nav({ page: String(p) })} aria-current={p === data.page ? "page" : undefined}>{p}</Button>))}
        {pages > 5 && <><span className="px-1">…</span><Button size="sm" variant="ghost" color="neutral" onClick={() => nav({ page: String(pages) })}>{pages}</Button></>}
        <Button size="sm" variant="ghost" color="neutral" disabled={data.page >= pages} onClick={() => nav({ page: String(data.page + 1) })} aria-label="Next page">›</Button>
      </div>
    </div>
  );
}
