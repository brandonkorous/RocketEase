"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Avatar, Badge, Button, Checkbox } from "@wizeworks/silicaui-react";
import { bulkDecide } from "@/lib/actions/approvals";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { ApprovalDetail } from "./approvals/detail";
import { AutomationQueue } from "./approvals/automation-queue";
import { STATE, type ApprovalRow, type ApprovalsData, type Nav } from "./approvals/types";
import { NetMark } from "./net-mark";

export type { ApprovalRow, ApprovalsData, Reviewer } from "./approvals/types";

export function ApprovalsScreen({ data }: { data: ApprovalsData }) {
  const router = useRouter();
  const params = useSearchParams();
  const { run, pending } = useActionFeedback();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const nav: Nav = (patch) => { const next = new URLSearchParams(params.toString()); for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k); router.push(`?${next.toString()}`); };
  const tabs = [["all", "All", data.counts.all], ["pending", "Needs review", data.counts.pending], ["changes", "Changes requested", data.counts.changes], ["approved", "Approved", data.counts.approved], ["scheduled", "Scheduled", data.counts.scheduled]] as const;

  return (
    <div className="mx-auto w-full max-w-360 px-6 py-5 lg:px-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div><h1 className="app-title">Approvals</h1><p className="mt-1 text-base text-secondary">Review, approve, and manage content across your team and clients.</p></div>
        <select className="select select-sm w-auto" value={data.filters.sort} onChange={(e) => nav({ sort: e.target.value })} aria-label="Sort"><option value="due">Sort: Due date (soonest)</option><option value="newest">Sort: Newest</option></select>
      </div>
      <div className="mt-5 flex flex-wrap items-end gap-3 rounded-box border border-base-300 p-3">
        <label className="flex flex-col text-xs text-secondary/70">Assignee<select className="select select-sm mt-1 w-45" value={data.filters.assignee} onChange={(e) => nav({ assignee: e.target.value || null })}><option value="">All reviewers</option>{data.reviewers.map((r) => (<option key={r.userId} value={r.userId}>{r.name}</option>))}</select></label>
        <label className="flex flex-col text-xs text-secondary/70">Channel<select className="select select-sm mt-1 w-45" value={data.filters.channel} onChange={(e) => nav({ channel: e.target.value || null })}><option value="">All channels</option>{data.channels.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}</select></label>
        {(data.filters.assignee || data.filters.channel) && <button type="button" className="mb-2 text-sm text-info hover:underline" onClick={() => nav({ assignee: null, channel: null })}>Clear all</button>}
      </div>
      {data.automations.length > 0 && <div className="mt-4"><AutomationQueue workspaceId={data.workspaceId} rows={data.automations} /></div>}
      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <section className="rounded-box border border-base-300" aria-label="Approval queue">
          <div className="flex flex-wrap gap-x-5 gap-y-1 border-b border-base-300 px-4" role="tablist">
            {tabs.map(([key, label, n]) => (<button key={key} type="button" role="tab" aria-selected={data.tab === key} onClick={() => nav({ tab: key })} className={`flex items-center gap-2 whitespace-nowrap border-b-2 py-3 text-sm ${data.tab === key ? "border-base-content font-semibold" : "border-transparent text-secondary"}`}>{label}<span className="rounded-full bg-base-200 px-1.5 text-xs">{n}</span></button>))}
          </div>
          {checked.size > 0 && (
            <div className="flex items-center gap-2 border-b border-base-300 bg-base-200 px-4 py-2 text-sm">
              <span>{checked.size} selected</span>
              <Button size="sm" color="primary" loading={pending} onClick={() => run(() => bulkDecide(data.workspaceId, [...checked], "approved"), () => setChecked(new Set()))}>Approve selected</Button>
              <Button size="sm" variant="ghost" color="neutral" onClick={() => setChecked(new Set())}>Deselect</Button>
            </div>
          )}
          <ul className="divide-y divide-base-300">
            {data.rows.length === 0 && <li className="p-8 text-center text-sm text-secondary/70">{data.tab === "pending" ? "Nothing waiting for review." : "No requests here."}</li>}
            {data.rows.map((r) => (<QueueRow key={r.id} r={r} active={data.detail?.id === r.id} checked={checked.has(r.id)} onCheck={(on) => { const n = new Set(checked); on ? n.add(r.id) : n.delete(r.id); setChecked(n); }} onOpen={() => nav({ request: r.id })} />))}
          </ul>
        </section>
        <section className="rounded-box border border-base-300" aria-label="Request detail">
          {data.detail ? <ApprovalDetail d={data.detail} data={data} /> : <div className="p-8 text-center text-sm text-secondary/70">Select a request to review it.</div>}
        </section>
      </div>
    </div>
  );
}

function QueueRow({ r, active, checked, onCheck, onOpen }: { r: ApprovalRow; active: boolean; checked: boolean; onCheck: (on: boolean) => void; onOpen: () => void }) {
  const st = STATE[r.state] ?? STATE.pending;
  return (
    <li className={`flex items-start gap-3 px-4 py-3 ${active ? "border-l-2 border-base-content bg-base-200/60" : "hover:bg-base-200/40"}`}>
      {r.state === "pending" && r.canDecide && <Checkbox className="mt-1" checked={checked} onChange={(e) => onCheck(e.target.checked)} aria-label={`Select ${r.title}`} />}
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-start gap-3 text-left">
        <span className="h-14 w-14 shrink-0 overflow-hidden rounded-field bg-base-200">{r.thumbUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={r.thumbUrl} alt="" className="h-full w-full object-cover" />}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">{r.channels.slice(0, 3).map((c) => (<NetMark key={c.id} network={c.network} size={14} />))}<span className="truncate text-sm font-semibold">{r.title}</span></span>
          <span className="block truncate text-xs text-secondary">{r.channels.map((c) => c.name).join(" · ") || "No channels"}</span>
          <span className={`block text-xs ${r.overdue ? "font-medium text-error" : "text-secondary/70"}`}>{r.dueLabel ? `Due ${r.dueLabel}${r.overdue ? " · overdue" : ""}` : r.createdAt}</span>
        </span>
      </button>
      <span className="flex shrink-0 flex-col items-end gap-1.5">
        <Badge size="xs" variant="soft" color={st.color}>{st.label}</Badge>
        {r.assignee ? <span className="flex items-center gap-1 text-xs text-secondary"><Avatar size="xs" color="neutral" alt="" src={r.assignee.image ?? undefined}>{r.assignee.name.slice(0, 2).toUpperCase()}</Avatar>{r.assignee.name.split(" ")[0]}</span> : <span className="text-xs text-secondary/70">Unassigned</span>}
      </span>
    </li>
  );
}
