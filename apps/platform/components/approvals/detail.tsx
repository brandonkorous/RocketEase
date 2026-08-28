"use client";

import Link from "next/link";
import { useState } from "react";
import { Avatar, Badge, Button, Textarea } from "@wizeworks/silicaui-react";
import { addComment, assignRequest, cancelRequest, decideRequest } from "@/lib/actions/approvals";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { workspacePath } from "@/lib/nav";
import { NetMark } from "../net-mark";
import { STATE, TIMELINE_DOT, type ApprovalDetailData, type ApprovalsData } from "./types";

type Tab = "preview" | "details" | "history" | "activity";

export function ApprovalDetail({ d, data }: { d: ApprovalDetailData; data: ApprovalsData }) {
  const [tab, setTab] = useState<Tab>("preview");
  const st = STATE[d.state] ?? STATE.pending;
  return (
    <div className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-lg font-bold">{d.title}</h2><Badge size="xs" variant="soft" color={st.color}>{st.label}</Badge>{d.stale && <Badge size="xs" variant="soft" color="warning">Newer version exists</Badge>}</div>
          <p className="mt-0.5 flex items-center gap-2 text-xs text-secondary">{d.channels.map((c) => (<span key={c.id} className="flex items-center gap-1"><NetMark network={c.network} size={12} />{c.name}</span>))}</p>
        </div>
        <Link href={workspacePath(data.workspaceId, `posts/${d.itemId}`)} className="text-sm font-medium hover:underline">Open post ↗</Link>
      </div>
      <div className="mt-3 flex gap-4 border-b border-base-300" role="tablist">
        {(["preview", "details", "history", "activity"] as const).map((t) => (<button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`border-b-2 py-2 text-sm capitalize ${tab === t ? "border-base-content font-semibold" : "border-transparent text-secondary"}`}>{t}</button>))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="min-w-0">
          {tab === "preview" && <Preview d={d} />}
          {tab === "details" && <Details d={d} />}
          {(tab === "history" || tab === "preview") && <Versions d={d} />}
          {(tab === "activity" || tab === "preview") && <Timeline d={d} />}
        </div>
        <aside className="flex flex-col gap-3">
          <ReviewActions d={d} workspaceId={data.workspaceId} />
          <Assignee d={d} data={data} />
          <Comments d={d} data={data} />
        </aside>
      </div>
    </div>
  );
}

function Preview({ d }: { d: ApprovalDetailData }) {
  const media = d.snapshot?.media ?? [];
  return (
    <div className="rounded-xl border border-base-300">
      {media.length > 0 && <div className={`grid gap-0.5 ${media.length > 1 ? "grid-cols-2" : ""}`}>{media.slice(0, 4).map((m) => (<div key={m.id} className="aspect-square bg-base-200">{m.url && /* eslint-disable-next-line @next/next/no-img-element */ <img src={m.url} alt={m.alt} className="h-full w-full object-cover" />}</div>))}</div>}
      <div className="p-3"><p className="whitespace-pre-wrap text-sm leading-normal">{d.snapshot?.text || <em className="text-secondary/70">No text</em>}</p>{d.snapshot?.link && <a className="mt-1 block truncate text-xs text-info" href={d.snapshot.link} target="_blank" rel="noreferrer">{d.snapshot.link}</a>}</div>
    </div>
  );
}

function Details({ d }: { d: ApprovalDetailData }) {
  const onApprove = d.scheduleOnApprove ? (d.scheduleOnApprove === "now" ? "Publish immediately" : `Schedule for ${d.scheduleOnApprove.replace("T", " ")}`) : "Nothing automatic";
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm"><dt className="text-secondary/70">Requested by</dt><dd>{d.requester}</dd><dt className="text-secondary/70">Requested</dt><dd>{d.createdAt}</dd><dt className="text-secondary/70">Due</dt><dd>{d.dueLabel ?? "—"}</dd><dt className="text-secondary/70">On approval</dt><dd>{onApprove}</dd><dt className="text-secondary/70">Note</dt><dd>{d.note ?? "—"}</dd></dl>
  );
}

function Versions({ d }: { d: ApprovalDetailData }) {
  return (
    <div className="mt-4 rounded-xl border border-base-300 p-3">
      <h3 className="text-sm font-semibold">Versions</h3>
      <ul className="mt-2 flex flex-col gap-1.5">{d.versions.map((v) => (<li key={v.id} className={`rounded-field border px-2.5 py-1.5 text-xs ${v.current ? "border-base-content" : "border-base-300"}`}>Version {v.number} {v.current && <span className="text-info">(under review)</span>}<span className="block text-xs text-secondary/70">{v.at}{v.by ? ` by ${v.by}` : ""} · {v.reason.replace("_", " ")}</span></li>))}</ul>
    </div>
  );
}

function Timeline({ d }: { d: ApprovalDetailData }) {
  return (
    <div className="mt-4 rounded-xl border border-base-300 p-3">
      <h3 className="text-sm font-semibold">Approval timeline</h3>
      <ol className="mt-3 flex flex-wrap gap-4">{d.timeline.map((t, i) => (<li key={i} className="flex min-w-27.5 flex-col items-start gap-1 text-xs"><span className={`h-4 w-4 rounded-full ${TIMELINE_DOT[t.kind] ?? "bg-base-content"}`} aria-hidden="true" /><span className="font-semibold capitalize">{t.label}</span><span className="text-secondary/70">{t.at}</span><span className="text-secondary/70">{t.by}</span></li>))}</ol>
    </div>
  );
}

function ReviewActions({ d, workspaceId }: { d: ApprovalDetailData; workspaceId: string }) {
  const { run, pending } = useActionFeedback();
  const [mode, setMode] = useState<"none" | "changes" | "reject">("none");
  const [text, setText] = useState("");
  const decide = (decision: "approved" | "changes_requested" | "rejected") => run(() => decideRequest({ workspaceId, requestId: d.id, decision, comment: text || undefined }), (r) => { if (!r.error) { setMode("none"); setText(""); } });
  return (
    <div className="rounded-xl border border-base-300 p-3">
      <h3 className="text-sm font-semibold">Review actions</h3>
      {d.state !== "pending" ? (
        <p className="mt-2 text-xs text-secondary">Decided. Decisions are immutable; a new version needs a new request.</p>
      ) : !d.canDecide ? (
        <p className="mt-2 text-xs text-secondary">{d.decideReason}</p>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
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

function Comments({ d, data }: { d: ApprovalDetailData; data: ApprovalsData }) {
  const { run, pending } = useActionFeedback();
  const [text, setText] = useState("");
  return (
    <div className="rounded-xl border border-base-300 p-3">
      <h3 className="text-sm font-semibold">Comments <span className="rounded-full bg-base-200 px-1.5 text-xs font-normal">{d.comments.length}</span></h3>
      {data.canComment && (<form className="mt-2 flex gap-1" onSubmit={(e) => { e.preventDefault(); run(() => addComment(data.workspaceId, d.itemId, text), (r) => { if (!r.error) setText(""); }); }}><input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment..." className="input input-sm flex-1" aria-label="Comment" /><Button type="submit" size="sm" color="primary" loading={pending}>Post</Button></form>)}
      <ul className="mt-3 flex flex-col gap-3">{d.comments.map((c) => (<li key={c.id} className="flex gap-2 text-xs"><Avatar size="xs" color="neutral" alt="" src={c.image ?? undefined}>{c.by.slice(0, 2).toUpperCase()}</Avatar><span className="min-w-0"><span className="font-semibold">{c.mine ? "You" : c.by}</span> <span className="text-secondary/70">{c.at}</span><span className="block whitespace-pre-wrap">{c.body}</span></span></li>))}{d.comments.length === 0 && <li className="text-xs text-secondary/70">No comments yet.</li>}</ul>
    </div>
  );
}
