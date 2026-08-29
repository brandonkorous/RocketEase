"use client";

import { Button } from "@wizeworks/silicaui-react";

type Props<T> = {
  label: string;
  hint?: string;
  rows: T[];
  blank: T;
  max: number;
  canEdit: boolean;
  addLabel: string;
  onChange: (rows: T[]) => void;
  render: (row: T, set: (patch: Partial<T>) => void, index: number) => React.ReactNode;
};

/** A list of structured rows — swatches, offers, audiences — added and removed in place. */
export function Repeater<T>({ label, hint, rows, blank, max, canEdit, addLabel, onChange, render }: Props<T>) {
  const set = (i: number) => (patch: Partial<T>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => onChange(rows.filter((_, j) => j !== i));

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-base font-semibold">{label}</h3>
        {hint && <p className="mt-1 text-sm leading-relaxed text-secondary">{hint}</p>}
      </div>
      {rows.length === 0 && <p className="text-sm text-secondary/70">Nothing here yet.</p>}
      <ul className="flex flex-col gap-3">
        {rows.map((row, i) => (
          <li key={i} className="rounded-box border border-base-300 p-3">
            <div className="flex flex-col gap-3">
              {render(row, set(i), i)}
              {canEdit && (
                <div className="flex justify-end">
                  <Button type="button" size="xs" variant="ghost" color="neutral" onClick={() => remove(i)}>Remove</Button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
      {canEdit && rows.length < max && (
        <div>
          <Button type="button" size="sm" variant="outline" color="neutral" onClick={() => onChange([...rows, blank])}>{addLabel}</Button>
        </div>
      )}
    </section>
  );
}
