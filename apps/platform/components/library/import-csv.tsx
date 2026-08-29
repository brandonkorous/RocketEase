"use client";

import { useRef, useState } from "react";
import { Button, Checkbox, Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@wizeworks/silicaui-react";
import { importPostsCsv, type ImportResult, type ImportRow } from "@/lib/actions/content/import";
import { csvTemplate, IMPORT_HEADERS, MAX_IMPORT_ROWS } from "@/lib/importing/csv";
import { useActionFeedback } from "@/lib/use-action-feedback";

type Props = { workspaceId: string; canPublish: boolean; trigger: React.ReactElement };

/** Bulk import of posts from a CSV. Always previews first; committing creates drafts. */
export function ImportCsvDialog({ workspaceId, canPublish, trigger }: Props) {
  const { run, pending } = useActionFeedback();
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState<{ name: string; text: string } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [schedule, setSchedule] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pick = async (file: File | undefined) => {
    setResult(null);
    if (!file) return setCsv(null);
    setCsv({ name: file.name, text: await file.text() });
  };
  const preview = () => csv && run(() => importPostsCsv({ workspaceId, csv: csv.text, commit: false }), setResult);
  const commit = () => csv && run(() => importPostsCsv({ workspaceId, csv: csv.text, commit: true, schedule }), (r) => { setResult(r); if (r.created) setCsv(null); });

  const rows = result?.rows ?? [];
  const ready = rows.filter((r) => !r.blocked).length;

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => { setOpen(o); if (!o) { setCsv(null); setResult(null); } }}>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <DialogContent className="max-w-180">
        <DialogTitle>Import posts from CSV</DialogTitle>
        <DialogDescription className="mt-1 text-sm text-secondary">
          Up to {MAX_IMPORT_ROWS} rows. Columns: {IMPORT_HEADERS.join(", ")}. Every row is checked against each destination before anything is written, and media URLs are kept as a note — the files themselves are never downloaded.
        </DialogDescription>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
          <Button size="sm" variant="outline" color="neutral" onClick={() => fileRef.current?.click()}>{csv ? "Choose another file" : "Choose CSV"}</Button>
          {csv && <span className="text-sm text-secondary">{csv.name}</span>}
          <TemplateLink />
          <span className="flex-1" />
          <Button size="sm" variant="outline" color="neutral" loading={pending} disabled={!csv} onClick={preview}>Check rows</Button>
        </div>

        {result?.error && <p className="mt-3 text-sm text-error">{result.error}</p>}
        {rows.length > 0 && <RowTable rows={rows} ignored={result?.ignored ?? 0} />}

        {rows.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={schedule} disabled={!canPublish} onChange={(e) => setSchedule(e.target.checked)} />
              Schedule rows that carry a future time {canPublish ? "" : "(you can't publish in this workspace)"}
            </label>
            <div className="flex gap-2">
              <DialogClose><Button size="sm" variant="ghost" color="neutral">Close</Button></DialogClose>
              <Button size="sm" color="primary" loading={pending} disabled={ready === 0} onClick={commit}>Import {ready} draft{ready === 1 ? "" : "s"}</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TemplateLink() {
  const download = () => {
    const url = URL.createObjectURL(new Blob([csvTemplate()], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "make-it-social-posts-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };
  return <button type="button" onClick={download} className="text-sm font-medium underline underline-offset-2">Download template</button>;
}

function RowTable({ rows, ignored }: { rows: ImportRow[]; ignored: number }) {
  return (
    <div className="mt-4">
      {ignored > 0 && <p className="mb-2 text-sm text-warning">{ignored} row{ignored === 1 ? "" : "s"} past the {MAX_IMPORT_ROWS}-row limit were ignored.</p>}
      <div className="max-h-96 overflow-y-auto rounded-box border border-base-300">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-base-100 text-xs text-secondary">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Row</th>
              <th className="px-3 py-2 text-left font-medium">Post</th>
              <th className="px-3 py-2 text-left font-medium">Destinations</th>
              <th className="px-3 py-2 text-left font-medium">Checks</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-base-300 align-top">
            {rows.map((r) => (
              <tr key={r.line} className={r.blocked ? "bg-error/5" : ""}>
                <td className="px-3 py-2 text-secondary/70">{r.line}</td>
                <td className="max-w-70 px-3 py-2"><span className="block truncate">{r.title}</span>{r.when && <span className="block text-xs text-secondary/70">{r.when}</span>}</td>
                <td className="px-3 py-2 text-xs text-secondary">{r.channelNames.join(", ") || "—"}</td>
                <td className="px-3 py-2">
                  {r.problems.length === 0 ? <span className="text-xs text-secondary/70">Ready</span> : (
                    <ul className="flex flex-col gap-0.5">
                      {r.problems.map((p, i) => (
                        <li key={i} className={`text-xs ${p.severity === "error" ? "text-error" : "text-warning"}`}>{p.severity === "error" ? "✕" : "⚠"} {p.channelName ? `${p.channelName}: ` : ""}{p.message}</li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
