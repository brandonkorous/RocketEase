"use client";

import { Button, Input } from "@wizeworks/silicaui-react";
import type { Condition, ConditionGroup, TriggerKind } from "@/db/schema/automations";
import { fieldDef, fieldsFor, opsFor } from "@/lib/automations/fields";

const OP_LABEL: Record<string, string> = { eq: "is", neq: "is not", contains: "contains", matches: "matches regex", gt: "is greater than", lt: "is less than", in: "is one of" };

type Props = { trigger: TriggerKind; group: ConditionGroup; onChange: (g: ConditionGroup) => void };

function ValueField({ trigger, c, onChange }: { trigger: TriggerKind; c: Condition; onChange: (value: string) => void }) {
  const def = fieldDef(trigger, c.field);
  const id = `cond-value-${c.field}-${c.op}`;
  if (def?.options && (c.op === "eq" || c.op === "neq")) {
    return (
      <select aria-label="Value" className="select select-sm w-40" value={c.value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose…</option>
        {def.options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    );
  }
  return <Input id={id} aria-label="Value" size="sm" className="w-40" value={c.value} placeholder={def?.hint ?? "Value"} onChange={(e) => onChange(e.target.value)} />;
}

export function ConditionRows({ trigger, group, onChange }: Props) {
  const fields = fieldsFor(trigger);
  const set = (i: number, patch: Partial<Condition>) => onChange({ ...group, conditions: group.conditions.map((c, n) => (n === i ? { ...c, ...patch } : c)) });
  const add = () => {
    const first = fields[0];
    if (first) onChange({ ...group, conditions: [...group.conditions, { field: first.key, op: first.ops[0], value: "" }] });
  };
  const remove = (i: number) => onChange({ ...group, conditions: group.conditions.filter((_, n) => n !== i) });

  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-2 text-sm text-secondary">
        Run when
        <select aria-label="Match mode" className="select select-sm w-auto" value={group.match} onChange={(e) => onChange({ ...group, match: e.target.value === "any" ? "any" : "all" })}>
          <option value="all">every condition</option>
          <option value="any">any condition</option>
        </select>
        holds.
      </label>
      {group.conditions.length === 0 && <p className="text-sm text-secondary/70">No conditions — the rule runs on every one of these events.</p>}
      {group.conditions.map((c, i) => {
        const ops = opsFor(trigger, c.field);
        return (
          <div key={`${i}-${c.field}`} className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Field"
              className="select select-sm w-48"
              value={c.field}
              onChange={(e) => {
                const next = fieldDef(trigger, e.target.value);
                set(i, { field: e.target.value, op: next && !next.ops.includes(c.op) ? next.ops[0] : c.op, value: "" });
              }}
            >
              {fields.map((f) => (
                <option key={f.key} value={f.key}>{f.label}</option>
              ))}
            </select>
            <select aria-label="Operator" className="select select-sm w-40" value={c.op} onChange={(e) => set(i, { op: e.target.value as Condition["op"] })}>
              {ops.map((o) => (
                <option key={o} value={o}>{OP_LABEL[o] ?? o}</option>
              ))}
            </select>
            <ValueField trigger={trigger} c={c} onChange={(value) => set(i, { value })} />
            <Button type="button" size="xs" variant="ghost" color="neutral" onClick={() => remove(i)} aria-label={`Remove condition ${i + 1}`}>Remove</Button>
          </div>
        );
      })}
      <div><Button type="button" size="xs" variant="outline" color="neutral" onClick={add} disabled={!fields.length}>Add condition</Button></div>
    </div>
  );
}
