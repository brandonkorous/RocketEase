"use client";

import { Button, Checkbox, Input, Label, Switch, Textarea } from "@wizeworks/silicaui-react";
import type { WorkspaceRole } from "@/db/schema/app";
import type { ConditionGroup, RuleAction, TriggerKind } from "@/db/schema/automations";
import { ACTIONS_FOR_TRIGGER, TRIGGER_HINT, TRIGGER_LABEL, TRIGGER_ORDER } from "@/lib/automations/labels";
import type { AutomationOptions, RuleRow } from "@/lib/automations/queries";
import { blankAction } from "./action-config";
import { ActionList } from "./action-list";
import { ConditionRows } from "./conditions";

export type Draft = {
  id?: string;
  name: string;
  description: string;
  enabled: boolean;
  trigger: TriggerKind;
  thresholdPercent: string;
  channelIds: string[];
  conditions: ConditionGroup;
  actions: RuleAction[];
  requiresApproval: boolean;
  approverRoles: WorkspaceRole[];
};

const APPROVER_ROLES: WorkspaceRole[] = ["owner", "admin", "manager", "client_approver"];

export const blankDraft = (): Draft => ({
  name: "",
  description: "",
  enabled: true,
  trigger: "inbox.message_received",
  thresholdPercent: "80",
  channelIds: [],
  conditions: { match: "all", conditions: [] },
  actions: [blankAction(ACTIONS_FOR_TRIGGER["inbox.message_received"][0])],
  requiresApproval: false,
  approverRoles: ["owner", "admin", "manager"],
});

export const draftFrom = (r: RuleRow): Draft => ({
  id: r.id,
  name: r.name,
  description: r.description,
  enabled: r.enabled,
  trigger: r.trigger,
  thresholdPercent: String(r.triggerConfig.thresholdPercent ?? 80),
  channelIds: r.triggerConfig.channelIds ?? [],
  conditions: r.conditions,
  actions: r.actions,
  requiresApproval: r.requiresApproval,
  approverRoles: r.approverRoles,
});

type Props = { draft: Draft; options: AutomationOptions; pending: boolean; onChange: (d: Draft) => void; onSave: () => void; onCancel: () => void; onTest?: () => void };

function Section({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-base-300 pt-4 first:border-t-0 first:pt-0">
      <h4 className="text-sm font-semibold">
        <span className="text-secondary/70">{step}.</span> {title}
      </h4>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function TriggerScope({ draft, options, onChange }: { draft: Draft; options: AutomationOptions; onChange: (d: Draft) => void }) {
  if (draft.trigger === "campaign.budget_threshold") {
    return (
      <div className="mt-3 flex items-end gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="au-threshold">Trip at (% of planned budget)</Label>
          <Input id="au-threshold" type="number" size="sm" className="w-28" min={1} max={1000} value={draft.thresholdPercent} onChange={(e) => onChange({ ...draft, thresholdPercent: e.target.value })} />
        </div>
        <p className="pb-1.5 text-xs text-secondary/70">Only campaigns with a planned budget are measured.</p>
      </div>
    );
  }
  if (!options.channels.length) return null;
  return (
    <fieldset className="mt-3">
      <legend className="text-xs text-secondary/70">Channels (none selected = all)</legend>
      <div className="mt-1 flex flex-wrap gap-3">
        {options.channels.map((c) => (
          <label key={c.id} className="flex items-center gap-1.5 text-sm">
            <Checkbox checked={draft.channelIds.includes(c.id)} onChange={(e) => onChange({ ...draft, channelIds: e.target.checked ? [...draft.channelIds, c.id] : draft.channelIds.filter((x) => x !== c.id) })} />
            {c.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

type Change = { draft: Draft; onChange: (d: Draft) => void };

function Identity({ draft, onChange }: Change) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="au-name">Rule name</Label>
          <Input id="au-name" size="sm" maxLength={80} required value={draft.name} placeholder="Escalate refund mentions" onChange={(e) => onChange({ ...draft, name: e.target.value })} />
        </div>
        <label className="flex items-end gap-2 pb-1.5 text-sm">
          Enabled <Switch checked={draft.enabled} onCheckedChange={(v: boolean) => onChange({ ...draft, enabled: v })} />
        </label>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="au-desc">What it is for <span className="font-normal text-secondary/70">(optional)</span></Label>
        <Textarea id="au-desc" rows={2} maxLength={300} className="w-full text-sm" value={draft.description} onChange={(e) => onChange({ ...draft, description: e.target.value })} />
      </div>
    </>
  );
}

function ApprovalGate({ draft, onChange }: Change) {
  return (
      <Section step={4} title="Approval gate">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={draft.requiresApproval} onCheckedChange={(v: boolean) => onChange({ ...draft, requiresApproval: v })} />
          Ask a person before applying anything
        </label>
        <p className="mt-1 text-xs text-secondary/70">Sending a saved reply and pausing ads always ask, whatever this is set to. Requests appear in Approvals.</p>
        <fieldset className="mt-2">
          <legend className="text-xs text-secondary/70">Who may decide</legend>
          <div className="mt-1 flex flex-wrap gap-3">
            {APPROVER_ROLES.map((r) => (
              <label key={r} className="flex items-center gap-1.5 text-sm">
                <Checkbox
                  checked={draft.approverRoles.includes(r)}
                  onChange={(e) => onChange({ ...draft, approverRoles: e.target.checked ? [...draft.approverRoles, r] : draft.approverRoles.filter((x) => x !== r) })}
                />
                {r.replace("_", " ")}
              </label>
            ))}
          </div>
        </fieldset>
      </Section>
  );
}

export function RuleBuilder({ draft, options, pending, onChange, onSave, onCancel, onTest }: Props) {
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave();
  };
  const changeTrigger = (trigger: TriggerKind) => onChange({ ...draft, trigger, channelIds: [], conditions: { match: draft.conditions.match, conditions: [] }, actions: [blankAction(ACTIONS_FOR_TRIGGER[trigger][0])] });

  return (
    <form onSubmit={submit} className="mt-4 flex flex-col gap-4 rounded-box border border-base-300 p-4">
      <Identity draft={draft} onChange={onChange} />

      <Section step={1} title="Trigger">
        <select aria-label="Trigger" className="select select-sm w-full max-w-100" value={draft.trigger} onChange={(e) => changeTrigger(e.target.value as TriggerKind)}>
          {TRIGGER_ORDER.map((t) => (
            <option key={t} value={t}>{TRIGGER_LABEL[t]}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-secondary/70">{TRIGGER_HINT[draft.trigger]}</p>
        <TriggerScope draft={draft} options={options} onChange={onChange} />
      </Section>

      <Section step={2} title="Conditions">
        <ConditionRows trigger={draft.trigger} group={draft.conditions} onChange={(conditions) => onChange({ ...draft, conditions })} />
      </Section>

      <Section step={3} title="Actions">
        <ActionList trigger={draft.trigger} actions={draft.actions} options={options} onChange={(actions) => onChange({ ...draft, actions })} />
      </Section>

      <ApprovalGate draft={draft} onChange={onChange} />

      <div className="flex flex-wrap justify-end gap-2 border-t border-base-300 pt-3">
        {draft.id && onTest && (
          <Button type="button" size="sm" variant="outline" color="neutral" loading={pending} onClick={onTest}>
            Test against the last 50 items
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" color="neutral" onClick={onCancel}>Cancel</Button>
        <Button type="submit" size="sm" color="primary" loading={pending} disabled={!draft.name.trim() || draft.actions.length === 0}>
          {draft.id ? "Save rule" : "Create rule"}
        </Button>
      </div>
    </form>
  );
}
