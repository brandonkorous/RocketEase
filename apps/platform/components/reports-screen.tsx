"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, Button } from "@wizeworks/silicaui-react";
import { deleteReport, runReportNow } from "@/lib/actions/reports";
import type { ReportListRow, RunRow } from "@/lib/analytics/reports";
import { workspacePath } from "@/lib/nav";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { ConfirmDialog } from "./confirm-dialog";
import { ExternalRecipientsPanel } from "./reports/external-recipients-panel";
import { ReportForm, type ReportFormInitial } from "./reports/report-form";
import { SharePopover } from "./reports/share-popover";
import type { ExternalRecipientRow } from "@/lib/actions/report-recipients";

export type ReportsData = { workspaceId: string; definitions: ReportListRow[]; runs: RunRow[]; channels: { id: string; name: string }[]; external: ExternalRecipientRow[]; canManage: boolean; newInitial: ReportFormInitial | null };

const CADENCE: Record<string, string> = { none: "Manual", daily: "Daily", weekly: "Weekly", monthly: "Monthly" };
const STATUS: Record<string, "success" | "warning" | "error" | "info"> = { done: "success", running: "info", queued: "warning", failed: "error" };

function DefinitionRow({ d, workspaceId, canManage }: { d: ReportListRow; workspaceId: string; canManage: boolean }) {
  const { run, pending } = useActionFeedback();
  return (
    <tr>
      <td className="py-2"><Link href={workspacePath(workspaceId, `reports/${d.id}`)} className="font-medium hover:underline">{d.name}</Link><div className="text-xs text-secondary/70">{d.window}</div></td>
      <td className="py-2 text-sm">{CADENCE[d.cadence]}{d.recipients ? ` · ${d.recipients} recipient${d.recipients > 1 ? "s" : ""}` : ""}<div className="text-xs text-secondary/70">{d.clientFacing ? "Branded client document" : d.format === "html" ? "Branded document" : "CSV export"}</div></td>
      <td className="py-2 text-xs text-secondary">{d.lastRun ?? "Never"}</td>
      <td className="py-2 text-xs text-secondary">{d.nextRun ?? "—"}</td>
      <td className="py-2 text-right">{canManage && (<span className="flex justify-end gap-1"><Button size="xs" variant="outline" color="neutral" loading={pending} onClick={() => run(() => runReportNow(workspaceId, d.id))}>Run now</Button><ConfirmDialog trigger={<Button size="xs" variant="ghost" color="error" disabled={pending}>Delete</Button>} title={`Delete "${d.name}"?`} description="Scheduled deliveries stop. Generated files stay in the history below." confirmLabel="Delete" onConfirm={() => run(() => deleteReport(workspaceId, d.id))} /></span>)}</td>
    </tr>
  );
}

export function ReportsScreen({ data }: { data: ReportsData }) {
  const [creating, setCreating] = useState(!!data.newInitial);
  return (
    <div className="mx-auto flex w-full max-w-360 flex-col gap-4 px-4 py-5 lg:px-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div><h1 className="app-title">Reports</h1><p className="mt-1 text-base text-secondary">Saved views, scheduled deliveries, and every export generated for this workspace.</p></div>
        <div className="flex gap-2"><Link href={workspacePath(data.workspaceId, "analytics")} className="btn btn-outline btn-sm">Open analytics</Link>{data.canManage && !creating && <Button size="sm" color="primary" onClick={() => setCreating(true)}>New report</Button>}</div>
      </div>
      {creating && (
        <section className="rounded-box border border-base-300 p-4" aria-label="New report">
          <h2 className="text-sm font-semibold">New report</h2>
          <div className="mt-3"><ReportForm workspaceId={data.workspaceId} initial={data.newInitial ?? {}} channels={data.channels} external={data.external} onDone={() => setCreating(false)} /></div>
        </section>
      )}
      <section className="rounded-box border border-base-300 p-4" aria-label="Saved reports">
        <h2 className="text-sm font-semibold">Saved reports</h2>
        <table className="mt-3 w-full text-sm">
          <thead className="text-xs text-secondary"><tr><th className="pb-2 text-left font-medium">Report</th><th className="pb-2 text-left font-medium">Schedule</th><th className="pb-2 text-left font-medium">Last run</th><th className="pb-2 text-left font-medium">Next run</th><th /></tr></thead>
          <tbody className="divide-y divide-base-300">
            {data.definitions.map((d) => (<DefinitionRow key={d.id} d={d} workspaceId={data.workspaceId} canManage={data.canManage} />))}
            {data.definitions.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-xs text-secondary/70">No saved reports yet. Build a view in Analytics and choose “Save as report”.</td></tr>}
          </tbody>
        </table>
      </section>
      <section className="rounded-box border border-base-300 p-4" aria-label="Report history">
        <h2 className="text-sm font-semibold">Report history</h2>
        <table className="mt-3 w-full text-sm">
          <thead className="text-xs text-secondary"><tr><th className="pb-2 text-left font-medium">Report name</th><th className="pb-2 text-left font-medium">Date generated</th><th className="pb-2 text-left font-medium">Generated by</th><th className="pb-2 text-left font-medium">Format</th><th className="pb-2 text-left font-medium">Status</th><th /></tr></thead>
          <tbody className="divide-y divide-base-300">
            {data.runs.map((r) => (
              <tr key={r.id}>
                <td className="py-2 font-medium">{r.name}</td>
                <td className="py-2 text-xs text-secondary">{r.generatedAt}</td>
                <td className="py-2 text-xs text-secondary">{r.by ?? "Schedule"}</td>
                <td className="py-2 text-xs">{r.format}{r.sizeBytes ? ` · ${(r.sizeBytes / 1024).toFixed(1)} KB` : ""}</td>
                <td className="py-2"><Badge size="xs" variant="soft" color={STATUS[r.status] ?? "info"}>{r.status}</Badge>{r.error && <span className="ml-2 text-xs text-error">{r.error}</span>}</td>
                <td className="py-2 text-right">{r.status === "done" && r.objectKey && (<span className="flex items-center justify-end gap-2"><a href={workspacePath(data.workspaceId, `reports/download?run=${r.id}`)} className="text-xs font-medium hover:underline">Download</a>{data.canManage && <SharePopover workspaceId={data.workspaceId} runId={r.id} runName={r.name} />}</span>)}</td>
              </tr>
            ))}
            {data.runs.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-xs text-secondary/70">No reports generated yet.</td></tr>}
          </tbody>
        </table>
      </section>
      <ExternalRecipientsPanel workspaceId={data.workspaceId} rows={data.external} canManage={data.canManage} />
    </div>
  );
}
