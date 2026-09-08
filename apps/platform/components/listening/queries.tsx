"use client";

import Link from "next/link";
import { Button } from "@wizeworks/silicaui-react";
import { checkListeningNow, deleteListeningQuery, setListeningQueryEnabled } from "@/lib/actions/listening";
import { LISTENING_COVERAGE } from "@/lib/listening/coverage";
import type { ListeningScreenData, QueryRow } from "@/lib/listening/screen";
import { workspacePath } from "@/lib/nav";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { ConfirmDialog } from "../confirm-dialog";
import { QueryDialog } from "./query-dialog";

function QueryCard({ q, data, active }: { q: QueryRow; data: ListeningScreenData; active: boolean }) {
  const { run, pending } = useActionFeedback();
  const ws = data.workspaceId;
  const failed = q.checks.filter((c) => c.status === "failed");
  return (
    <li className={`flex flex-col gap-1 rounded-field border px-3 py-2.5 ${active ? "border-base-content bg-base-200" : "border-base-300"}`}>
      <div className="flex items-center justify-between gap-2">
        <Link href={`${workspacePath(ws, "analytics/listening")}?query=${q.id}`} className="truncate text-sm font-semibold hover:underline">{q.name}</Link>
        <span className="shrink-0 text-xs text-secondary">{q.enabled ? `${q.hits7d} in 7 days` : "paused"}</span>
      </div>
      <div className="truncate text-xs text-secondary" title={q.terms.join(", ")}>{q.terms.join(", ")}</div>
      <div className="text-xs text-secondary">{q.networks.map((n) => LISTENING_COVERAGE[n].label).join(" · ")} · {q.lastChecked ? `checked ${q.lastChecked}` : "not checked yet"}</div>
      {failed.map((c) => (<div key={c.network} className="text-xs text-error"><span aria-hidden="true">⚠</span> {LISTENING_COVERAGE[c.network].label}: {c.note}</div>))}
      {active && data.canEdit && (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <QueryDialog workspaceId={ws} networkState={data.networkState} initial={q} />
          <Button size="xs" variant="ghost" color="neutral" loading={pending} onClick={() => run(() => checkListeningNow(ws, q.id))}>Check now</Button>
          <Button size="xs" variant="ghost" color="neutral" disabled={pending} onClick={() => run(() => setListeningQueryEnabled(ws, q.id, !q.enabled))}>{q.enabled ? "Pause" : "Resume"}</Button>
          <ConfirmDialog trigger={<Button size="xs" variant="ghost" color="neutral">Delete</Button>} title={`Delete “${q.name}”?`} description="The query and every hit it captured are removed." confirmLabel="Delete" onConfirm={() => run(() => deleteListeningQuery(ws, q.id))} />
        </div>
      )}
    </li>
  );
}

export function QueriesRail({ data }: { data: ListeningScreenData }) {
  return (
    <section className="flex flex-col gap-2 rounded-box border border-base-300 p-4" aria-label="Queries">
      <h2 className="text-sm font-semibold">Queries</h2>
      <ul className="flex flex-col gap-2">
        {data.queries.map((q) => (<QueryCard key={q.id} q={q} data={data} active={q.id === data.activeQueryId} />))}
        {data.queries.length === 0 && <li className="text-sm text-secondary/70">No queries yet. Add the words people use for your brand, your products or a competitor.</li>}
      </ul>
      <p className="mt-2 text-xs leading-relaxed text-secondary/70">Each query is checked every 30 minutes on every network it lists; the first check reaches 7 days back. A hit is one public post that matched at check time; a later edit or deletion at the network is not seen.</p>
    </section>
  );
}
