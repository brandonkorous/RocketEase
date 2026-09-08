"use client";

import Link from "next/link";
import { Button } from "@wizeworks/silicaui-react";
import { hideListeningHit } from "@/lib/actions/listening";
import { LISTENING_COVERAGE, LISTENING_NETWORKS } from "@/lib/listening/coverage";
import type { HitRow, ListeningScreenData } from "@/lib/listening/screen";
import { workspacePath } from "@/lib/nav";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { NetMark } from "../net-mark";

function Row({ h, workspaceId, canEdit }: { h: HitRow; workspaceId: string; canEdit: boolean }) {
  const { run, pending } = useActionFeedback();
  return (
    <li className="flex gap-3 border-b border-base-300 px-1 py-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-base-300"><NetMark network={h.network} size={16} /></span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap gap-x-2 text-xs text-secondary">
          {h.author.url ? <a href={h.author.url} target="_blank" rel="noreferrer" className="font-semibold text-base-content hover:underline">{h.author.handle ?? h.author.name}</a> : <span className="font-semibold text-base-content">{h.author.handle ?? h.author.name}</span>}
          <span>{h.networkLabel}</span><span>·</span><span>{h.at}</span><span>·</span><span>matched “{h.term.replace(/^"|"$/g, "")}”</span>
        </div>
        <p className="text-sm leading-relaxed">{h.text}</p>
        <div className="flex gap-3 text-xs">
          {h.url && <a href={h.url} target="_blank" rel="noreferrer" className="underline">Open {h.network === "youtube" ? "video" : "post"} ↗</a>}
          {canEdit && <Button size="xs" variant="ghost" color="neutral" loading={pending} onClick={() => run(() => hideListeningHit(workspaceId, h.id))}>Hide from feed</Button>}
        </div>
      </div>
    </li>
  );
}

function Pager({ data }: { data: ListeningScreenData }) {
  const { page, pageSize, total } = data.feed;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => `${workspacePath(data.workspaceId, "analytics/listening")}?query=${data.activeQueryId}${data.network ? `&network=${data.network}` : ""}&page=${p}`;
  const cls = (on: boolean, active = false) => `rounded-field border px-2.5 py-1 text-xs ${active ? "border-base-content font-semibold" : on ? "border-base-300 hover:bg-base-200" : "pointer-events-none border-base-300 opacity-40"}`;
  const from = total ? (page - 1) * pageSize + 1 : 0;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-secondary">
      <span>{total ? `Showing ${from}–${Math.min(total, page * pageSize)} of ${total} hit${total === 1 ? "" : "s"}` : "No hits yet"}</span>
      <nav className="flex items-center gap-1" aria-label="Pages">
        <Link href={href(page - 1)} className={cls(page > 1)} aria-label="Previous page">‹</Link>
        {Array.from({ length: pages }, (_, i) => i + 1).slice(Math.max(0, page - 3), page + 2).map((p) => (<Link key={p} href={href(p)} className={cls(true, p === page)} aria-current={p === page ? "page" : undefined}>{p}</Link>))}
        <Link href={href(page + 1)} className={cls(page < pages)} aria-label="Next page">›</Link>
      </nav>
    </div>
  );
}

export function Feed({ data }: { data: ListeningScreenData }) {
  const base = `${workspacePath(data.workspaceId, "analytics/listening")}?query=${data.activeQueryId ?? ""}`;
  const tab = (on: boolean) => `border-b-2 px-3 py-2 text-sm ${on ? "border-base-content font-semibold" : "border-transparent text-secondary"}`;
  const total = Object.values(data.feed.counts).reduce((a, b) => a + b, 0);
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-box border border-base-300 p-4" aria-label="Feed">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav className="flex border-b border-base-300" role="tablist" aria-label="Network">
          <Link href={base} role="tab" aria-selected={!data.network} className={tab(!data.network)}>All networks {total}</Link>
          {LISTENING_NETWORKS.map((n) => (<Link key={n} href={`${base}&network=${n}`} role="tab" aria-selected={data.network === n} className={tab(data.network === n)}>{LISTENING_COVERAGE[n].label} {data.feed.counts[n]}</Link>))}
        </nav>
        <span className="text-xs text-secondary">Sort: <span className="font-medium text-base-content">Newest</span></span>
      </div>
      <ul className="flex flex-col">
        {data.feed.rows.map((h) => (<Row key={h.id} h={h} workspaceId={data.workspaceId} canEdit={data.canEdit} />))}
        {data.feed.rows.length === 0 && <li className="py-8 text-center text-sm text-secondary/70">{data.activeQueryId ? "Nothing matched yet. The first check reaches 7 days back and runs within a minute of saving." : "Create a query to start."}</li>}
      </ul>
      <Pager data={data} />
    </section>
  );
}
