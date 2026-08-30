"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Progress, SearchInput } from "@wizeworks/silicaui-react";
import { workspacePath } from "@/lib/nav";
import { DetailPanel } from "./library/detail-panel";
import { BrandKitPanel } from "./library/brand-kit-panel";
import { AssetGrid } from "./library/grid";
import { ImportCsvDialog } from "./library/import-csv";
import { LibIcon } from "./library/icons";
import { CollectionsRail } from "./library/rail";
import { fmtBytes, fmtDate, type LibraryData } from "./library/types";
import { useUploads } from "./library/use-uploads";

export type { AssetCard, CollectionRow, LibraryData } from "./library/types";
export { NetMark } from "./net-mark";

type Nav = (patch: Record<string, string | null>) => void;

export function LibraryScreen({ data }: { data: LibraryData }) {
  const router = useRouter();
  const params = useSearchParams();
  const { uploads, uploadFiles } = useUploads(data.workspaceId);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);
  const processing = data.assets.some((a) => a.uploadStatus === "processing" || a.uploadStatus === "pending");
  useEffect(() => { if (!processing) return; const t = setInterval(() => router.refresh(), 2500); return () => clearInterval(t); }, [processing, router]);

  const nav: Nav = (patch) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    if (!("page" in patch)) next.delete("page");
    router.push(`?${next.toString()}`);
  };

  return (
    <div className="mx-auto w-full max-w-360 px-6 py-6 lg:px-8">
      <Header data={data} nav={nav} onUpload={() => fileRef.current?.click()} />
      {data.canEdit && <input ref={fileRef} type="file" multiple accept="image/*,video/*,application/pdf" className="hidden" onChange={(e) => e.target.files && uploadFiles(e.target.files)} />}
      {uploads.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2 rounded-box border border-base-300 p-4" aria-live="polite">
          {uploads.map((u, i) => (<li key={i} className="text-sm"><div className="flex items-center justify-between"><span className="truncate">{u.name}</span><span className="text-secondary/70">{u.status === "error" ? u.error : u.status === "done" ? "Done" : u.status === "processing" ? "Processing…" : `${Math.round(u.progress * 100)}%`}</span></div>{u.status !== "error" && <Progress value={u.progress * 100} max={100} color="neutral" size="xs" className="mt-1" />}</li>))}
        </ul>
      )}
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="min-w-0">
          <div className="rounded-box border border-base-300">
            <Tabs data={data} nav={nav} />
            <div className="grid md:grid-cols-[200px_1fr]"><CollectionsRail data={data} nav={nav} /><AssetGrid data={data} nav={nav} checked={checked} setChecked={setChecked} onDropFiles={uploadFiles} /></div>
          </div>
          <BottomRow data={data} nav={nav} />
        </div>
        <aside className="xl:sticky xl:top-6 xl:self-start">
          {data.selected ? <DetailPanel a={data.selected} workspaceId={data.workspaceId} canEdit={data.canEdit} timezone={data.timezone} collections={data.collections} onClose={() => nav({ asset: null })} /> : <div className="rounded-box border border-dashed border-base-300 p-6 text-center text-sm text-secondary/70">Select an asset to see details, usage, tags, and variants.</div>}
        </aside>
      </div>
    </div>
  );
}

function Header({ data, nav, onUpload }: { data: LibraryData; nav: Nav; onUpload: () => void }) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div><h1 className="app-title">Content Library</h1><p className="mt-1 text-base text-secondary">Organize, manage, and reuse your content across all platforms.</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput placeholder="Search assets..." defaultValue={data.query.q} onChange={(e) => nav({ q: e.target.value || null })} className="w-60" aria-label="Search assets" />
        <Button variant="outline" color="neutral" iconStart={LibIcon.filter} onClick={() => nav({ smart: data.query.smart ? null : "review" })}>Filters</Button>
        <label className="flex h-10 items-center gap-2 rounded-field border border-base-300 px-3 text-sm"><span className="text-secondary/70">Sort:</span><select value={data.query.sort} onChange={(e) => nav({ sort: e.target.value })} className="bg-transparent font-medium outline-none" aria-label="Sort"><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="name">Name</option><option value="size">Size</option></select></label>
        {data.canEdit && <ImportCsvDialog workspaceId={data.workspaceId} canPublish={data.canPublish} trigger={<Button variant="outline" color="neutral">Import CSV</Button>} />}
        {data.canEdit && <Button color="primary" iconStart={LibIcon.upload} onClick={onUpload}>Upload</Button>}
      </div>
    </div>
  );
}

function Tabs({ data, nav }: { data: LibraryData; nav: Nav }) {
  const tabs = [
    { key: "all", label: "All Assets", n: data.tabs.all }, { key: "images", label: "Images", n: data.tabs.images }, { key: "videos", label: "Videos", n: data.tabs.videos },
    { key: "drafts", label: "Drafts", n: data.tabs.drafts, href: workspacePath(data.workspaceId, "calendar?view=list&status=draft") }, { key: "templates", label: "Templates", n: data.tabs.templates }, { key: "copy", label: "Copy", n: data.tabs.copy },
  ];
  return (
    <div className="flex gap-6 overflow-x-auto border-b border-base-300 px-5" role="tablist">
      {tabs.map((t) => {
        const active = data.query.tab === t.key || (t.key === "all" && !data.query.tab);
        const cls = `flex items-center gap-2 whitespace-nowrap border-b-2 py-3.5 text-sm ${active ? "border-base-content font-semibold" : "border-transparent text-secondary hover:text-base-content"}`;
        const inner = <><span>{t.label}</span><span className="rounded-full bg-base-200 px-2 py-0.5 text-xs text-secondary">{t.n.toLocaleString()}</span></>;
        // Drafts lives on the Calendar, not in this collection. It is a link out
        // of the section, so it says so rather than looking like a sibling tab.
        return t.href ? (
          <Link key={t.key} href={t.href} className={cls} role="link" title="Drafts are listed on the Calendar">
            {inner}
            <span aria-hidden className="text-xs text-secondary">↗</span>
          </Link>
        ) : (
          <button key={t.key} type="button" role="tab" aria-selected={active} className={cls} onClick={() => nav({ tab: t.key === "all" ? null : t.key })}>{inner}</button>
        );
      })}
    </div>
  );
}

function BottomRow({ data, nav }: { data: LibraryData; nav: Nav }) {
  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-3">
      <section className="rounded-box border border-base-300 p-4" aria-labelledby="recent-h">
        <div className="flex items-center justify-between"><h2 id="recent-h" className="text-sm font-semibold">Recent uploads</h2><button type="button" className="text-xs font-medium hover:underline" onClick={() => nav({ sort: "newest", tab: null, folder: null, smart: null })}>View all</button></div>
        <ul className="mt-3 flex flex-col gap-2.5">
          {data.recent.map((r) => (<li key={r.id}><button type="button" onClick={() => nav({ asset: r.id })} className="flex w-full items-center gap-3 text-left"><span className="h-8 w-8 shrink-0 overflow-hidden rounded-md bg-base-200">{r.thumbUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={r.thumbUrl} alt="" className="h-full w-full object-cover" />}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{r.fileName}</span><span className="block text-xs text-secondary/70">{fmtDate(r.createdAt, data.timezone)}</span></span><span className="text-xs text-secondary/70">{fmtBytes(r.bytes)}</span></button></li>))}
          {data.recent.length === 0 && <li className="text-sm text-secondary/70">Nothing uploaded yet.</li>}
        </ul>
      </section>
      <section className="rounded-box border border-base-300 p-4" aria-labelledby="tpl-h">
        <div className="flex items-center justify-between"><h2 id="tpl-h" className="text-sm font-semibold">Saved templates</h2><span className="text-xs text-secondary/70">View all</span></div>
        <p className="mt-3 text-sm leading-relaxed text-secondary">Save a post as a template from the post page to reuse its structure. Templates carry structure and defaults, never live results.</p>
      </section>
      <BrandKitPanel workspaceId={data.workspaceId} brand={data.brand} />
    </div>
  );
}
