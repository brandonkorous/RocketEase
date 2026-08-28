"use client";

import { useState } from "react";
import { Badge, Button, Switch } from "@wizeworks/silicaui-react";
import { TRIGGER_LABEL } from "@/lib/automations/labels";
import type { AutomationsData, RuleRow, RunRow } from "@/lib/automations/queries";
import { testAutomationRule, type DryRunHit } from "@/lib/actions/automations/dry-run";
import { deleteAutomationRule, saveAutomationRule, setAutomationEnabled, type AutomationRuleInput } from "@/lib/actions/automations/rules";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { ConfirmDialog } from "../../confirm-dialog";
import { RuleBuilder, blankDraft, draftFrom, type Draft } from "./builder";
import { DryRunPanel, RunHistory } from "./runs";

type Props = { workspaceId: string; data: AutomationsData; canEdit: boolean };

/** Draft → the shape the server action validates. */
function toInput(workspaceId: string, d: Draft): AutomationRuleInput {
  const threshold = Number(d.thresholdPercent);
  return {
    workspaceId,
    id: d.id,
    name: d.name,
    description: d.description,
    enabled: d.enabled,
    trigger: d.trigger,
    triggerConfig: {
      ...(d.trigger === "campaign.budget_threshold" && Number.isFinite(threshold) ? { thresholdPercent: threshold } : {}),
      ...(d.channelIds.length ? { channelIds: d.channelIds } : {}),
    },
    conditions: d.conditions,
    actions: d.actions,
    requiresApproval: d.requiresApproval,
    approverRoles: d.approverRoles,
  };
}

export function AutomationsSettings({ workspaceId, data, canEdit }: Props) {
  const { run, pending } = useActionFeedback();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [hits, setHits] = useState<DryRunHit[] | null>(null);
  const close = () => {
    setDraft(null);
    setHits(null);
  };
  const edit = (d: Draft, h: DryRunHit[] | null = null) => {
    setDraft(d);
    setHits(h);
  };

  return (
    <div className="mt-4 flex max-w-220 flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <p className="max-w-140 text-sm leading-relaxed text-secondary">
          Rules react to something that happened and do a small, named thing about it. Every rule acts with the permissions of the person who saved it, and anything that speaks to a customer or stops spend asks a person first.
        </p>
        {canEdit && !draft && <Button size="sm" color="primary" onClick={() => edit(blankDraft())}>New rule</Button>}
      </div>

      {draft && (
        <RuleBuilder
          draft={draft}
          options={data.options}
          pending={pending}
          onChange={setDraft}
          onSave={() => run(() => saveAutomationRule(toInput(workspaceId, draft)), (r) => { if (!r.error) close(); })}
          onCancel={close}
          onTest={draft.id ? () => run(() => testAutomationRule(workspaceId, draft.id!), (r) => setHits(r.hits ?? null)) : undefined}
        />
      )}
      {draft && hits && <DryRunPanel hits={hits} onClose={() => setHits(null)} />}

      <RuleTable
        rules={data.rules}
        runs={data.runs}
        canEdit={canEdit}
        pending={pending}
        onEdit={(r) => edit(draftFrom(r))}
        onEnable={(r, on) => run(() => setAutomationEnabled(workspaceId, r.id, on))}
        onDelete={(r) => run(() => deleteAutomationRule(workspaceId, r.id))}
        onTest={(r) => run(() => testAutomationRule(workspaceId, r.id), (res) => edit(draftFrom(r), res.hits ?? []))}
      />
    </div>
  );
}

type TableProps = {
  rules: RuleRow[];
  runs: RunRow[];
  canEdit: boolean;
  pending: boolean;
  onEdit: (r: RuleRow) => void;
  onEnable: (r: RuleRow, on: boolean) => void;
  onDelete: (r: RuleRow) => void;
  onTest: (r: RuleRow) => void;
};

function RuleTable({ rules, runs, ...rest }: TableProps) {
  const [openRuns, setOpenRuns] = useState<string | null>(null);
  return (
    <table className="w-full text-sm">
      <thead className="text-xs text-secondary">
        <tr>
          <th className="pb-2 text-left font-medium">Rule</th>
          <th className="pb-2 text-left font-medium">Trigger</th>
          <th className="pb-2 text-left font-medium">Last run</th>
          <th className="pb-2 text-left font-medium">Runs</th>
          <th className="pb-2 text-left font-medium">On</th>
          <th />
        </tr>
      </thead>
      <tbody className="divide-y divide-base-300 align-top">
        {rules.map((r) => (
          <RuleRowView
            key={r.id}
            r={r}
            runs={runs.filter((x) => x.ruleId === r.id).slice(0, 8)}
            open={openRuns === r.id}
            onToggleRuns={() => setOpenRuns(openRuns === r.id ? null : r.id)}
            {...rest}
          />
        ))}
        {rules.length === 0 && (
          <tr>
            <td colSpan={6} className="py-8 text-center text-sm text-secondary/70">
              No automations yet. A first one might be: when an Instagram comment contains “refund”, set priority to urgent and notify managers.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

type RowProps = Omit<TableProps, "rules" | "runs"> & { r: RuleRow; runs: RunRow[]; open: boolean; onToggleRuns: () => void };

function RuleRowView({ r, runs, canEdit, pending, open, onToggleRuns, onEdit, onEnable, onDelete, onTest }: RowProps) {
  return (
    <>
      <tr>
        <td className="py-2 pr-3">
          <span className="font-medium">{r.name}</span>
          {r.requiresApproval && <Badge size="xs" variant="soft" color="warning" className="ml-2">Approval</Badge>}
          <span className="block max-w-80 truncate text-xs text-secondary/70">{r.actionSummary}</span>
        </td>
        <td className="py-2 pr-3 text-secondary">{TRIGGER_LABEL[r.trigger]}</td>
        <td className="py-2 pr-3 whitespace-nowrap text-xs text-secondary/70">{r.lastRun ?? "Never"}</td>
        <td className="py-2 pr-3">
          <button type="button" className="text-sm hover:underline" onClick={onToggleRuns} aria-expanded={open}>{r.runCount}</button>
        </td>
        <td className="py-2 pr-3">
          <Switch checked={r.enabled} disabled={!canEdit || pending} onCheckedChange={(on: boolean) => onEnable(r, on)} aria-label={`Enable ${r.name}`} />
        </td>
        <td className="py-2 text-right">
          {canEdit && (
            <span className="flex justify-end gap-1">
              <Button size="xs" variant="ghost" color="neutral" disabled={pending} onClick={() => onTest(r)}>Test</Button>
              <Button size="xs" variant="outline" color="neutral" onClick={() => onEdit(r)}>Edit</Button>
              <ConfirmDialog
                trigger={<Button size="xs" variant="ghost" color="error" disabled={pending}>Delete</Button>}
                title={`Delete "${r.name}"?`}
                description="The rule stops immediately and its run history goes with it. Anything it already did stays."
                confirmLabel="Delete"
                onConfirm={() => onDelete(r)}
              />
            </span>
          )}
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6} className="pb-4"><RunHistory runs={runs} /></td>
        </tr>
      )}
    </>
  );
}
