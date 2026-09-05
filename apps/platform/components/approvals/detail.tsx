"use client";

import Link from "next/link";
import { useState } from "react";
import { Avatar, Badge, Button, Textarea } from "@wizeworks/silicaui-react";
import { assignRequest, cancelRequest, decideRequest } from "@/lib/actions/approvals";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { workspacePath } from "@/lib/nav";
import { NetMark } from "../net-mark";
import { Comments } from "./comments";
import { DueDateCard, OverdueBadge } from "./due";
import { Details, Preview, Timeline, Versions } from "./preview";
import { STATE, type Anchor, type ApprovalDetailData, type ApprovalsData } from "./types";

type Tab = "preview" | "details" | "history" | "activity";
const POST_ANCHOR: Anchor = { field: null, assetId: null };

export function ApprovalDetail({ d, data }: { d: ApprovalDetailData; data: ApprovalsData }) {
  const [tab, setTab] = useState<Tab>("preview");
  const [anchor, setAnchor] = useState<Anchor>(POST_ANCHOR);
  const st = STATE[d.state] ?? STATE.pending;
  const onAnchor = (a: Anchor) => { setTab("preview"); setAnchor(a); };
  return (
    <div className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-lg font-bold">{d.title}</h2><Badge size="xs" variant="soft" color={st.color}>{st.label}</Badge>{d.overdue && <OverdueBadge />}{d.stale && <Badge size="xs" variant="soft" color="warning">Newer version exists</Badge>}</div>
          <p className="mt-0.5 flex items-center gap-2 text-xs text-secondary">{d.channels.map((c) => (<span key={c.id} className="flex items-center gap-1"><NetMark network={c.network} size={12} />{c.name}</span>))}</p>
        </div>
        <Link href={workspacePath(data.workspaceId, `posts/${d.itemId}`)} className="text-sm font-medium hover:underline">Open post ↗</Link>
      </div>
      <div className="mt-3 flex gap-4 border-b border-base-300" role="tablist">
        {(["preview", "details", "history", "activity"] as const).map((t) => (<button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`border-b-2 py-2 text-sm capitalize ${tab === t ? "border-base-content font-semibold" : "border-transparent text-secondary"}`}>{t}</button>))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="min-w-0">
          {tab === "preview" && <Preview d={d} comments={d.comments} anchor={anchor} onAnchor={setAnchor} />}
          {tab === "details" && <Details d={d} />}
          {(tab === "history" || tab === "preview") && <Versions d={d} />}
          {(tab === "activity" || tab === "preview") && <Timeline d={d} />}
        </div>
        <aside className="flex flex-col gap-3">
          <ReviewActions d={d} workspaceId={data.workspaceId} />
          <Assignee d={d} data={data} />
          <DueDateCard d={d} data={data} />
          <Comments d={d} data={data} anchor={anchor} onAnchor={onAnchor} />
        </aside>
      </div>
    </div>
  );
}

function ReviewActions({ d, workspaceId }: { d: ApprovalDetailData; workspaceId: string }) {
  const { run, pending } = useActionFeedback();
  const [mode, setMode] = useState<"none" | "changes" | "reject">("none");
  const [text, setText] = useState("");
  const decide = (decision: "approved" | "changes_requested" | "rejected") => run(() => decideRequest({ workspaceId, requestId: d.id, decision, comment: text || undefined }), (r) => { if (!r.error) { setMode("none"); setText(""); } });
  const open = d.comments.filter((c) => !c.resolved && (c.field || c.assetId)).length;
  return (
    <div className="rounded-xl border border-base-300 p-3">
      <h3 className="text-sm font-semibold">Review actions</h3>
      {d.state !== "pending" ? (
        <p className="mt-2 text-xs text-secondary">Decided. Decisions are immutable; a new version needs a new request.</p>
      ) : !d.canDecide ? (
        <p className="mt-2 text-xs text-secondary">{d.decideReason}</p>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          {open > 0 && <p className="text-xs text-warning">{open} unresolved comment{open === 1 ? "" : "s"} on specific fields or media.</p>}
          <Button color="success" loading={pending} onClick={() => decide("approved")}>✓ Approve</Button>
          <Button variant="outline" color="neutral" onClick={() => setMode(mode === "changes" ? "none" : "changes")}>↻ Request changes</Button>
          <Button variant="ghost" color="error" size="sm" onClick={() => setMode(mode === "reject" ? "none" : "reject")}>Reject</Button>
          {mode !== "none" && (<div className="flex flex-col gap-2"><Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={mode === "changes" ? "What needs to change? (required)" : "Reason (required)"} className="w-full text-sm" /><Button size="sm" color={mode === "changes" ? "warning" : "error"} loading={pending} onClick={() => decide(mode === "changes" ? "changes_requested" : "rejected")}>Send</Button></div>)}
        </div>
      )}
      {d.canCancel && d.state === "pending" && <Button className="mt-2" size="sm" variant="ghost" color="neutral" disabled={pending} onClick={() => run(() => cancelRequest(workspaceId, d.id))}>Withdraw request</Button>}
    </div>
  );
}

function Assignee({ d, data }: { d: ApprovalDetailData; data: ApprovalsData }) {
  const { run } = useActionFeedback();
  return (
    <div className="rounded-xl border border-base-300 p-3">
      <h3 className="text-sm font-semibold">Assignee</h3>
      {d.assignee ? <div className="mt-2 flex items-center gap-2"><Avatar size="sm" color="neutral" alt="" src={d.assignee.image ?? undefined}>{d.assignee.name.slice(0, 2).toUpperCase()}</Avatar><span className="min-w-0"><span className="block truncate text-sm font-medium">{d.assignee.name}</span><span className="block text-xs capitalize text-secondary/70">{d.assignee.role.replace("_", " ")}</span></span></div> : <p className="mt-2 text-xs text-secondary/70">Any approver</p>}
      {!data.isClientApprover && d.state === "pending" && (<select className="select select-sm mt-2 w-full" value={d.assignee?.userId ?? ""} onChange={(e) => run(() => assignRequest(data.workspaceId, d.id, e.target.value || null))} aria-label="Reassign"><option value="">Reassign…</option>{data.reviewers.map((r) => (<option key={r.userId} value={r.userId}>{r.name} · {r.role.replace("_", " ")}</option>))}</select>)}
    </div>
  );
}
