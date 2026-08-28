"use client";

import { Button } from "@wizeworks/silicaui-react";
import type { RuleAction, TriggerKind } from "@/db/schema/automations";
import { ACTIONS_FOR_TRIGGER, ACTION_LABEL } from "@/lib/automations/labels";
import type { AutomationOptions } from "@/lib/automations/queries";
import { ActionConfig, blankAction } from "./action-config";

type Props = { trigger: TriggerKind; actions: RuleAction[]; options: AutomationOptions; onChange: (a: RuleAction[]) => void };

export function ActionList({ trigger, actions, options, onChange }: Props) {
  const allowed = ACTIONS_FOR_TRIGGER[trigger];
  const set = (i: number, a: RuleAction) => onChange(actions.map((x, n) => (n === i ? a : x)));
  const move = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= actions.length) return;
    const next = [...actions];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-2">
      {actions.length === 0 && <p className="text-sm text-secondary/70">No actions yet. A rule needs at least one.</p>}
      <ol className="flex flex-col gap-2">
        {actions.map((a, i) => (
          <li key={`${i}-${a.kind}`} className="flex flex-wrap items-center gap-2 rounded-field border border-base-300 p-2">
            <span className="text-xs text-secondary/70">{i + 1}.</span>
            <select
              aria-label={`Action ${i + 1}`}
              className="select select-sm w-60"
              value={a.kind}
              onChange={(e) => set(i, blankAction(e.target.value as RuleAction["kind"]))}
            >
              {allowed.map((k) => (
                <option key={k} value={k}>{ACTION_LABEL[k]}</option>
              ))}
            </select>
            <ActionConfig action={a} options={options} onChange={(next) => set(i, next)} />
            <span className="ml-auto flex gap-1">
              <Button type="button" size="xs" variant="ghost" color="neutral" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move action ${i + 1} up`}>↑</Button>
              <Button type="button" size="xs" variant="ghost" color="neutral" onClick={() => move(i, 1)} disabled={i === actions.length - 1} aria-label={`Move action ${i + 1} down`}>↓</Button>
              <Button type="button" size="xs" variant="ghost" color="neutral" onClick={() => onChange(actions.filter((_, n) => n !== i))} aria-label={`Remove action ${i + 1}`}>Remove</Button>
            </span>
          </li>
        ))}
      </ol>
      <div>
        <Button type="button" size="xs" variant="outline" color="neutral" disabled={actions.length >= 8} onClick={() => onChange([...actions, blankAction(allowed[0])])}>
          Add action
        </Button>
      </div>
    </div>
  );
}
