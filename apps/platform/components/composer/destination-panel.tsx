"use client";

import { useState } from "react";
import { Checkbox, Input, Radio, Textarea } from "@wizeworks/silicaui-react";
import { NetMark } from "../library-screen";
import type { Approval, ComposerChannel, Method, Reviewer } from "./types";
import type { ComposerState } from "./use-composer";

type Props = { s: ComposerState; channels: ComposerChannel[]; approval: Approval; reviewers: Reviewer[]; timezone: string };

const METHODS: { key: Method | "queue"; label: string }[] = [
  { key: "now", label: "Publish now" }, { key: "schedule", label: "Schedule" }, { key: "review", label: "Request approval" }, { key: "queue", label: "Add to queue (soon)" }, { key: "draft", label: "Save as draft" },
];

export function DestinationPanel({ s, channels, approval, reviewers, timezone }: Props) {
  const blocking = s.issues.filter((i) => i.severity === "error").length;
  const needsReview = approval.required && approval.state !== "approved";
  return (
    <aside className="flex flex-col divide-y divide-base-300 rounded-box border border-base-300" aria-label="Destination and schedule">
      <div className="p-4">
        <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Post destination</h2><span className="text-xs text-secondary/70">{s.selected.length} of {channels.filter((c) => c.formats.length).length} selected</span></div>
        <ul className="mt-3 flex flex-col gap-2.5">
          {channels.map((c) => (<li key={c.id}><label className={`flex items-center gap-2.5 text-sm ${c.formats.length ? "" : "opacity-50"}`}><NetMark network={c.network} size={16} /><span className="min-w-0 flex-1 truncate">{c.name}</span><Checkbox checked={s.selected.includes(c.id)} disabled={!c.formats.length} onChange={() => s.toggleChannel(c.id)} aria-label={c.name} /></label></li>))}
        </ul>
      </div>
      <div className="p-4">
        <h2 className="text-sm font-semibold">Publishing method</h2>
        <div className="mt-3 flex flex-col gap-2 text-sm">
          {METHODS.map((m) => {
            const locked = m.key === "queue" || (needsReview && (m.key === "now" || m.key === "schedule"));
            return (<label key={m.key} className={`flex items-center gap-2 ${locked ? "opacity-50" : ""}`}><Radio name="method" checked={s.method === m.key} disabled={locked} onChange={() => !locked && s.setMethod(m.key as Method)} />{m.label}</label>);
          })}
          {needsReview && <p className="text-xs text-secondary/70">Policy &ldquo;{approval.policyName}&rdquo; requires review before scheduling.</p>}
          {approval.state === "approved" && <p className="text-xs text-success">Approved. Schedule when ready; editing will require a new review.</p>}
        </div>
      </div>
      {s.method === "review" && <ReviewDetails s={s} reviewers={reviewers} />}
      {s.method === "schedule" && <ScheduleDetails s={s} timezone={timezone} />}
      <UtmSection s={s} />
      {blocking > 0 && <p className="p-4 text-xs text-error">{blocking} issue{blocking === 1 ? "" : "s"} must be fixed before scheduling.</p>}
    </aside>
  );
}

function DateTime({ s }: { s: ComposerState }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Input type="date" size="sm" value={s.date} onChange={(e) => s.setDate(e.target.value)} aria-label="Date" />
      <Input type="time" size="sm" value={s.time} onChange={(e) => s.setTime(e.target.value)} aria-label="Time" />
    </div>
  );
}

function ReviewDetails({ s, reviewers }: { s: ComposerState; reviewers: Reviewer[] }) {
  return (
    <div className="p-4">
      <h2 className="text-sm font-semibold">Review details</h2>
      <select className="select select-sm mt-3 w-full" value={s.reviewer} onChange={(e) => s.setReviewer(e.target.value)} aria-label="Reviewer"><option value="">Any approver</option>{reviewers.map((r) => (<option key={r.userId} value={r.userId}>{r.name} · {r.role.replace("_", " ")}</option>))}</select>
      <Textarea rows={2} value={s.reviewNote} onChange={(e) => s.setReviewNote(e.target.value)} placeholder="Note for the reviewer (optional)" className="mt-2 w-full text-sm" />
      <p className="mt-2 text-xs text-secondary/70">If approved, it will be scheduled for:</p>
      <div className="mt-1"><DateTime s={s} /></div>
    </div>
  );
}

function ScheduleDetails({ s, timezone }: { s: ComposerState; timezone: string }) {
  return (
    <div className="p-4">
      <h2 className="text-sm font-semibold">Schedule details</h2>
      <div className="mt-3"><DateTime s={s} /></div>
      <p className="mt-2 text-xs text-secondary/70">{timezone.replace("_", " ")}</p>
      <div className="mt-3 rounded-lg border border-base-300 p-3">
        <p className="text-sm font-semibold">Best times</p>
        <p className="text-xs text-secondary/70">Based on your audience activity</p>
        <p className="mt-2 rounded-field bg-base-200 px-3 py-2 text-xs text-secondary">Suggestions appear after this workspace has two weeks of analytics.</p>
      </div>
    </div>
  );
}

function UtmSection({ s }: { s: ComposerState }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="p-4">
      <button type="button" className="flex w-full items-center justify-between text-sm font-semibold" onClick={() => setOpen((v) => !v)} aria-expanded={open}>UTM tracking <span className="font-normal text-secondary/70">(optional)</span> <span className="text-secondary/70">{open ? "▴" : "▾"}</span></button>
      {open && (
        <div className="mt-3 flex flex-col gap-2">
          {(["source", "medium", "campaign"] as const).map((k) => (<Input key={k} size="sm" placeholder={`utm_${k}`} value={s.utm[k]} onChange={(e) => s.setUtm({ ...s.utm, [k]: e.target.value })} aria-label={`utm_${k}`} />))}
          {!s.link && <p className="text-xs text-secondary/70">Add a link under Advanced options to apply UTM parameters.</p>}
        </div>
      )}
    </div>
  );
}
