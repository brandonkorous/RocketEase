"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Switch } from "@wizeworks/silicaui-react";
import { deleteRecycleRule, runRecycleRuleNow, saveRecycleRule, setRecycleAutoSchedule, setRecycleRuleEnabled, type RecycleRuleInput } from "@/lib/actions/recycling";
import type { RecycleRuleRow, RecycleRunRow, RecyclingData } from "@/lib/recycling/queries";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { workspacePath } from "@/lib/nav";
import { ConfirmDialog } from "../../confirm-dialog";
import { blankDraft, draftFrom, RuleForm, type Draft } from "./form";

type Props = { workspaceId: string; timezone: string; data: RecyclingData; canEdit: boolean; canChangeSettings: boolean };

const toInput = (workspaceId: string, d: Draft): RecycleRuleInput => ({
  workspaceId, id: d.id, name: d.name, enabled: d.enabled, tagIds: d.tagIds, channelIds: d.channelIds,
  everyDays: Number(d.everyDays), atTime: d.atTime, maxRepeatsPerItem: Number(d.maxRepeatsPerItem), pauseUntil: d.pauseUntil,
});

export function RecyclingSettings({ workspaceId, timezone, data, canEdit, canChangeSettings }: Props) {
  const { run, pending } = useActionFeedback();
  const [draft, setDraft] = useState<Draft | null>(null);
  return (
    <div className="mt-4 flex max-w-220 flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <p className="max-w-140 text-sm leading-relaxed text-secondary">
          Re-post content that already worked, on a cadence you set. A rule only reuses posts that actually published, waits its cadence before touching the same post again, and never reuses media whose usage rights have lapsed.
        </p>
        {canEdit && !draft && <Button size="sm" color="primary" onClick={() => setDraft(blankDraft())}>New rule</Button>}
      </div>

      <AutoSchedule workspaceId={workspaceId} on={data.autoSchedule} canEdit={canChangeSettings} pending={pending} run={run} />

      {draft && (
        <RuleForm
          draft={draft}
          options={data.options}
          timezone={timezone}
          pending={pending}
          onChange={setDraft}
          onCancel={() => setDraft(null)}
          onSave={() => run(() => saveRecycleRule(toInput(workspaceId, draft)), (r) => { if (!r.error) setDraft(null); })}
        />
      )}

      <RuleList
        workspaceId={workspaceId}
        rules={data.rules}
        runs={data.runs}
        canEdit={canEdit}
        pending={pending}
        onEdit={(r) => setDraft(draftFrom(r))}
        onEnable={(r, on) => run(() => setRecycleRuleEnabled(workspaceId, r.id, on))}
        onDelete={(r) => run(() => deleteRecycleRule(workspaceId, r.id))}
        onRun={(r) => run(() => runRecycleRuleNow(workspaceId, r.id))}
      />
    </div>
  );
}

type Runner = ReturnType<typeof useActionFeedback>["run"];

function AutoSchedule({ workspaceId, on, canEdit, pending, run }: { workspaceId: string; on: boolean; canEdit: boolean; pending: boolean; run: Runner }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-box border border-base-300 p-4">
      <div>
        <div className="text-sm font-semibold">Schedule recycled posts automatically</div>
        <p className="mt-1 max-w-140 text-sm text-secondary">
          Off by default: a recycled post lands as a draft for someone to check. Turned on, the worker schedules it — but only when the rule&apos;s author still has permission to publish and every destination validates clean.
        </p>
      </div>
      <Switch checked={on} disabled={!canEdit || pending} onCheckedChange={(v: boolean) => run(() => setRecycleAutoSchedule(workspaceId, v))} aria-label="Schedule recycled posts automatically" />
    </div>
  );
}

type ListProps = { workspaceId: string; rules: RecycleRuleRow[]; runs: RecycleRunRow[]; canEdit: boolean; pending: boolean; onEdit: (r: RecycleRuleRow) => void; onEnable: (r: RecycleRuleRow, on: boolean) => void; onDelete: (r: RecycleRuleRow) => void; onRun: (r: RecycleRuleRow) => void };

function RuleList({ workspaceId, rules, runs, canEdit, pending, onEdit, onEnable, onDelete, onRun }: ListProps) {
  const [open, setOpen] = useState<string | null>(null);
  if (rules.length === 0) return <p className="text-sm text-secondary/70">No recycling rules yet. A first one might be: every 45 days at 09:00, reuse anything tagged &ldquo;evergreen&rdquo;, at most 3 times each.</p>;
  return (
    <ul className="flex flex-col divide-y divide-base-300 rounded-box border border-base-300">
      {rules.map((r) => (
        <li key={r.id} className="px-4 py-3">
          <div className="flex items-start gap-3">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">
                {r.name}
                {r.pauseUntilDay && <Badge size="xs" variant="soft" color="warning" className="ml-2">Paused to {r.pauseUntilDay}</Badge>}
              </span>
              <span className="block text-xs text-secondary/70">
                Every {r.everyDays} day{r.everyDays === 1 ? "" : "s"} at {r.atTime} · max {r.maxRepeatsPerItem} reuse{r.maxRepeatsPerItem === 1 ? "" : "s"} per post · {r.channelIds.length ? `${r.channelIds.length} channel${r.channelIds.length === 1 ? "" : "s"}` : "original channels"} · last run {r.lastRun ?? "never"}
              </span>
            </span>
            <Switch checked={r.enabled} disabled={!canEdit || pending} onCheckedChange={(on: boolean) => onEnable(r, on)} aria-label={`Enable ${r.name}`} />
            <span className="flex gap-1">
              <button type="button" className="text-sm text-secondary hover:underline" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>{r.runCount} run{r.runCount === 1 ? "" : "s"}</button>
              {canEdit && <Button size="xs" variant="ghost" color="neutral" disabled={pending} onClick={() => onRun(r)}>Run now</Button>}
              {canEdit && <Button size="xs" variant="outline" color="neutral" onClick={() => onEdit(r)}>Edit</Button>}
              {canEdit && (
                <ConfirmDialog
                  trigger={<Button size="xs" variant="ghost" color="error" disabled={pending}>Delete</Button>}
                  title={`Delete "${r.name}"?`}
                  description="The rule stops immediately. Drafts and posts it already made stay exactly as they are."
                  confirmLabel="Delete"
                  onConfirm={() => onDelete(r)}
                />
              )}
            </span>
          </div>
          {open === r.id && <RunHistory workspaceId={workspaceId} runs={runs.filter((x) => x.ruleId === r.id).slice(0, 10)} />}
        </li>
      ))}
    </ul>
  );
}

const OUTCOME_LABEL = { created: "Draft created", scheduled: "Scheduled", skipped: "Nothing reused", failed: "Failed" } as const;

function RunHistory({ workspaceId, runs }: { workspaceId: string; runs: RecycleRunRow[] }) {
  if (runs.length === 0) return <p className="mt-3 text-xs text-secondary/70">No runs recorded yet.</p>;
  return (
    <ul className="mt-3 flex flex-col gap-1.5 border-t border-base-300 pt-3">
      {runs.map((run) => (
        <li key={run.id} className="flex items-baseline gap-2 text-xs">
          <span className="w-28 shrink-0 text-secondary/70">{run.at}</span>
          <span className="font-medium">{OUTCOME_LABEL[run.outcome]}</span>
          {run.newItemId && <Link href={workspacePath(workspaceId, `posts/${run.newItemId}`)} className="truncate underline underline-offset-2">{run.newItemTitle ?? "View post"}</Link>}
          {run.reason && <span className="truncate text-secondary/70">{run.reason}</span>}
        </li>
      ))}
    </ul>
  );
}
