"use client";

import { useEffect, useState } from "react";
import { Button, Checkbox, Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, SearchInput } from "@wizeworks/silicaui-react";
import { canvaDesigns, disconnectCanva, importCanvaDesigns, type CanvaDesignRow } from "@/lib/actions/import";
import { useActionFeedback } from "@/lib/use-action-feedback";
import type { LibraryData } from "./types";

type Props = { workspaceId: string; canva: LibraryData["canva"]; trigger: React.ReactElement };
type Format = "png" | "jpg";

const when = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(iso)) : "");

function DesignRow({ d, on, toggle }: { d: CanvaDesignRow; on: boolean; toggle: () => void }) {
  return (
    <li>
      <label className="flex cursor-pointer items-center gap-3 rounded-field px-2 py-2 hover:bg-base-200">
        <Checkbox checked={on} onChange={toggle} aria-label={`Select ${d.title}`} />
        <span className="h-10 w-16 shrink-0 overflow-hidden rounded-md bg-base-200">{d.thumbUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={d.thumbUrl} alt="" className="h-full w-full object-cover" />}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{d.title}</span>
          <span className="block text-xs text-secondary/70">{d.pages} page{d.pages === 1 ? "" : "s"}{d.updatedAt ? ` · edited ${when(d.updatedAt)}` : ""}</span>
        </span>
      </label>
    </li>
  );
}

/** Pick designs from the person's own Canva account; each page becomes one image in the library. */
export function ImportCanvaDialog({ workspaceId, canva, trigger }: Props) {
  const { run, pending } = useActionFeedback();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<CanvaDesignRow[]>([]);
  const [tokens, setTokens] = useState<(string | null)[]>([null]);
  const [next, setNext] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, CanvaDesignRow>>({});
  const [format, setFormat] = useState<Format>("png");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (continuation: string | null, q = query) => {
    setLoading(true);
    setError(null);
    try {
      const r = await canvaDesigns(workspaceId, { query: q || undefined, continuation: continuation ?? undefined });
      if (r.error) return setError(r.error);
      setItems(r.items ?? []);
      setNext(r.continuation ?? null);
    } catch {
      setError("Canva could not be reached. Try again, or reconnect your account.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { if (open && canva.source) void load(null, ""); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const search = () => { setTokens([null]); void load(null); };
  const forward = () => { if (next) { setTokens((t) => [...t, next]); void load(next); } };
  const back = () => { if (tokens.length > 1) { const t = tokens.slice(0, -1); setTokens(t); void load(t[t.length - 1]); } };
  const chosen = Object.values(picked);
  const files = chosen.reduce((n, d) => n + Math.min(10, d.pages), 0);
  const submit = () => run(() => importCanvaDesigns(workspaceId, chosen.map((d) => ({ id: d.id, title: d.title, pages: d.pages })), format), (r) => { if (!r.error) { setPicked({}); setOpen(false); } });

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => { setOpen(o); if (!o) { setPicked({}); setError(null); } }}>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <DialogContent className="max-w-180">
        <DialogTitle>Import from Canva</DialogTitle>
        <DialogDescription className="mt-1 text-sm text-secondary">
          Each page of a design becomes one image, exported at the design&apos;s own size. The files are yours (you made the design), and the Canva design is recorded on each one.
        </DialogDescription>
        {!canva.configured && <p className="mt-4 text-sm text-secondary">Canva import is not set up on this server.</p>}
        {canva.configured && !canva.source && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <a href={`/api/import/canva/start?workspaceId=${workspaceId}`} className="btn btn-primary btn-sm">Connect your Canva account</a>
            <span className="text-xs text-secondary/70">Read-only: RocketEase sees your designs and exports the ones you pick. It never edits or deletes anything in Canva.</span>
          </div>
        )}
        {canva.source && (
          <>
            <form className="mt-4 flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); search(); }}>
              <SearchInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your designs" aria-label="Search designs" className="flex-1" />
              <Button type="submit" size="sm" variant="outline" color="neutral" loading={loading}>Search</Button>
              <span className="text-xs text-secondary/70">{canva.source.name}&apos;s Canva · <button type="button" className="underline" onClick={() => run(() => disconnectCanva(workspaceId), () => setOpen(false))}>Disconnect</button></span>
            </form>
            {error && <p className="mt-3 text-sm text-error">{error}</p>}
            <ul className="mt-3 max-h-96 divide-y divide-base-300 overflow-y-auto rounded-box border border-base-300" aria-label="Designs">
              {items.map((d) => (<DesignRow key={d.id} d={d} on={Boolean(picked[d.id])} toggle={() => setPicked((p) => { const n = { ...p }; if (n[d.id]) delete n[d.id]; else n[d.id] = d; return n; })} />))}
              {!loading && items.length === 0 && !error && <li className="px-3 py-6 text-center text-sm text-secondary/70">No designs found.</li>}
            </ul>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" color="neutral" disabled={tokens.length <= 1 || loading} onClick={back}>Previous page</Button>
                <Button size="sm" variant="ghost" color="neutral" disabled={!next || loading} onClick={forward}>Next page</Button>
                <label className="flex items-center gap-1.5 text-xs text-secondary">Format
                  <select className="select select-xs w-auto" value={format} onChange={(e) => setFormat(e.target.value as Format)} aria-label="Export format"><option value="png">PNG (lossless)</option><option value="jpg">JPG (quality 90)</option></select>
                </label>
              </div>
              <div className="flex gap-2">
                <DialogClose><Button size="sm" variant="ghost" color="neutral">Close</Button></DialogClose>
                <Button size="sm" color="primary" loading={pending} disabled={chosen.length === 0} onClick={submit}>Import {files} file{files === 1 ? "" : "s"}</Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
