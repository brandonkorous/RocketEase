"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@wizeworks/silicaui-react";
import { saveReport, type ReportInput } from "@/lib/actions/reports";
import { workspacePath } from "@/lib/nav";
import { useActionFeedback } from "@/lib/use-action-feedback";

export type ReportFormInitial = Partial<ReportInput> & { id?: string };

export function ReportForm({ workspaceId, initial, channels, onDone }: { workspaceId: string; initial: ReportFormInitial; channels: { id: string; name: string }[]; onDone?: () => void }) {
  const router = useRouter();
  const { run, pending } = useActionFeedback();
  const [v, setV] = useState<ReportInput>({
    id: initial.id, name: initial.name ?? "", from: initial.from ?? "", to: initial.to ?? "", rollingDays: initial.rollingDays ?? 28, channelId: initial.channelId ?? "", compare: initial.compare ?? "previous", scope: initial.scope ?? "all", cadence: initial.cadence ?? "none", recipients: initial.recipients ?? [],
  });
  const [recipients, setRecipients] = useState(v.recipients.join(", "));
  const set = <K extends keyof ReportInput>(k: K, val: ReportInput[K]) => setV((s) => ({ ...s, [k]: val }));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const list = recipients.split(/[,\s]+/).map((r) => r.trim()).filter(Boolean);
    run(() => saveReport(workspaceId, { ...v, recipients: list }), (r) => { if (!r.error) { onDone?.(); router.push(workspacePath(workspaceId, "reports")); } });
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm"><span className="text-xs font-medium text-secondary">Report name</span><input className="input input-sm" required value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="Weekly executive summary" /></label>
      <fieldset className="flex flex-col gap-2 rounded-field border border-base-300 p-3">
        <legend className="px-1 text-xs font-medium text-secondary">Period</legend>
        <label className="flex items-center gap-2 text-sm"><input type="radio" className="radio radio-sm" checked={v.rollingDays !== null} onChange={() => set("rollingDays", 28)} />Rolling window<input type="number" className="input input-xs w-20" min={1} max={365} value={v.rollingDays ?? 28} disabled={v.rollingDays === null} onChange={(e) => set("rollingDays", Number(e.target.value) || 1)} /> days ending yesterday</label>
        <label className="flex flex-wrap items-center gap-2 text-sm"><input type="radio" className="radio radio-sm" checked={v.rollingDays === null} onChange={() => set("rollingDays", null)} />Fixed dates<input type="date" className="input input-xs w-auto" value={v.from} onChange={(e) => set("from", e.target.value)} disabled={v.rollingDays !== null} /><span>→</span><input type="date" className="input input-xs w-auto" value={v.to} onChange={(e) => set("to", e.target.value)} disabled={v.rollingDays !== null} /></label>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm"><span className="text-xs font-medium text-secondary">Channel</span><select className="select select-sm" value={v.channelId ?? ""} onChange={(e) => set("channelId", e.target.value)}><option value="">All channels</option>{channels.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}</select></label>
        <label className="flex flex-col gap-1 text-sm"><span className="text-xs font-medium text-secondary">Comparison</span><select className="select select-sm" value={v.compare} onChange={(e) => set("compare", e.target.value as ReportInput["compare"])}><option value="previous">Previous period</option><option value="year">Previous year</option><option value="none">None</option></select></label>
        <label className="flex flex-col gap-1 text-sm"><span className="text-xs font-medium text-secondary">Scope</span><select className="select select-sm" value={v.scope} onChange={(e) => set("scope", e.target.value as ReportInput["scope"])}><option value="all">Organic + paid</option><option value="organic">Organic</option><option value="paid">Paid</option></select></label>
      </div>
      <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
        <label className="flex flex-col gap-1 text-sm"><span className="text-xs font-medium text-secondary">Schedule</span><select className="select select-sm" value={v.cadence} onChange={(e) => set("cadence", e.target.value as ReportInput["cadence"])}><option value="none">Manual only</option><option value="daily">Daily, 8:00</option><option value="weekly">Weekly, Monday 8:00</option><option value="monthly">Monthly, 1st 8:00</option></select></label>
        <label className="flex flex-col gap-1 text-sm"><span className="text-xs font-medium text-secondary">Recipients (workspace members only, comma-separated)</span><input className="input input-sm" value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="name@company.com" /></label>
      </div>
      <p className="text-xs text-secondary/70">Exports are CSV and include the period, filters, metric definitions (version), and source freshness. Recipients are re-checked against workspace membership at every run.</p>
      <div className="flex gap-2"><Button type="submit" color="primary" size="sm" loading={pending}>{v.id ? "Save changes" : "Save report"}</Button>{onDone && <Button type="button" variant="ghost" color="neutral" size="sm" onClick={onDone}>Cancel</Button>}</div>
    </form>
  );
}
