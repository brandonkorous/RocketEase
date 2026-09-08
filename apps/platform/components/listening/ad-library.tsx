"use client";

import { useState } from "react";
import { Button, Input, Label } from "@wizeworks/silicaui-react";
import { searchAds, type AdSearchInput } from "@/lib/actions/listening";
import type { AdSource } from "@/lib/listening/coverage";
import type { ListeningScreenData } from "@/lib/listening/screen";
import type { AdItem } from "@/lib/listening/types";
import { CoverageGrid } from "./coverage";

type Days = 30 | 90 | 365;
const when = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(iso)) : null);

function AdCard({ a }: { a: AdItem }) {
  return (
    <li className="flex flex-col gap-2.5 rounded-box border border-base-300 p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-base-300 text-xs font-semibold" aria-hidden="true">{a.source === "meta" ? "M" : "T"}</span>
        <span className="flex min-w-0 flex-col"><span className="truncate text-sm font-semibold">{a.advertiser}</span><span className="text-xs text-secondary">{a.platforms.join(", ")}</span></span>
      </div>
      {a.title && <p className="text-sm font-medium">{a.title}</p>}
      {a.text ? <p className="line-clamp-4 text-sm leading-relaxed">{a.text}</p> : <p className="text-sm text-secondary/70">No creative text reported by the source.</p>}
      <div className="flex flex-col gap-0.5 text-xs text-secondary">
        <span>{a.firstShown ? `First shown ${when(a.firstShown)}` : "First shown: not reported"}{a.lastShown ? ` · last shown ${when(a.lastShown)}` : a.firstShown ? " · still running" : ""}</span>
        {a.reachLabel && <span>{a.reach != null ? `${a.reach.toLocaleString()} — ` : ""}{a.reachLabel}</span>}
      </div>
      {a.snapshotUrl && <a href={a.snapshotUrl} target="_blank" rel="noreferrer" className="text-xs underline">View in the repository ↗</a>}
    </li>
  );
}

export function AdLibrary({ data }: { data: ListeningScreenData }) {
  const [term, setTerm] = useState("");
  const [source, setSource] = useState<AdSource>("meta");
  const [country, setCountry] = useState("DE");
  const [days, setDays] = useState<Days>(90);
  const [items, setItems] = useState<AdItem[] | null>(null);
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [next, setNext] = useState<string | null>(null);
  const [as, setAs] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async (cursor: string | undefined) => {
    setLoading(true); setError(null);
    try {
      const r = await searchAds(data.workspaceId, { term, source, country, days, cursor } as AdSearchInput);
      if (r.error) { setError(r.error); setItems(null); } else { setItems(r.items ?? []); setNext(r.cursor ?? null); setAs(r.as ?? null); }
    } catch { setError("The repository could not be reached."); } finally { setLoading(false); }
  };
  const search = (e: React.FormEvent) => { e.preventDefault(); setCursors([undefined]); void load(undefined); };
  const forward = () => { if (next) { setCursors((c) => [...c, next]); void load(next); } };
  const back = () => { if (cursors.length > 1) { const c = cursors.slice(0, -1); setCursors(c); void load(c[c.length - 1]); } };

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={search} className="flex flex-wrap items-end gap-3 rounded-box border border-base-300 p-4">
        <div className="flex min-w-60 flex-1 flex-col gap-1.5"><Label htmlFor="ad-term">Term or advertiser</Label><Input id="ad-term" value={term} maxLength={100} onChange={(e) => setTerm(e.target.value)} placeholder="e.g. brew bros" required /></div>
        <div className="flex flex-col gap-1.5"><Label htmlFor="ad-source">Source</Label><select id="ad-source" className="select w-64" value={source} onChange={(e) => setSource(e.target.value as AdSource)}>{data.adSources.map((s) => (<option key={s.key} value={s.key}>{s.label}</option>))}</select></div>
        <div className="flex flex-col gap-1.5"><Label htmlFor="ad-country">Country</Label><select id="ad-country" className="select w-44" value={country} onChange={(e) => setCountry(e.target.value)}>{data.countries.map((c) => (<option key={c.code} value={c.code}>{c.name}</option>))}</select></div>
        <div className="flex flex-col gap-1.5"><Label htmlFor="ad-days">Shown</Label><select id="ad-days" className="select w-40" value={days} onChange={(e) => setDays(Number(e.target.value) as Days)}><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={365}>Last year</option></select></div>
        <Button type="submit" color="primary" loading={loading} disabled={!term.trim()}>Search</Button>
      </form>
      {error && <p className="text-sm text-error"><span aria-hidden="true">⚠</span> {error}</p>}
      {items && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-secondary">
            <span>{items.length} ad{items.length === 1 ? "" : "s"} on this page from {data.adSources.find((s) => s.key === source)?.label}{as ? ` · read as ${as}` : ""}</span>
            <span>Dates and reach are the source’s own figures; RocketEase does not estimate them.</span>
          </div>
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map((a) => (<AdCard key={`${a.source}-${a.id}`} a={a} />))}{items.length === 0 && <li className="text-sm text-secondary/70">Nothing matched.</li>}</ul>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" color="neutral" disabled={cursors.length <= 1 || loading} onClick={back}>Previous page</Button>
            <Button size="sm" variant="ghost" color="neutral" disabled={!next || loading} onClick={forward}>Next page</Button>
          </div>
        </>
      )}
      <CoverageGrid title="Coverage — what each repository holds" rows={data.adSources} />
    </div>
  );
}
