"use client";

import { Button, Input, Label, NativeSelect, Textarea } from "@wizeworks/silicaui-react";

type Base = { id: string; label: string; hint?: string; disabled?: boolean };

export function Field({ id, label, hint, disabled, value, onChange, placeholder, maxLength, type }: Base & { value: string; onChange: (v: string) => void; placeholder?: string; maxLength?: number; type?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} size="sm" type={type} value={value} disabled={disabled} maxLength={maxLength} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {hint && <span className="text-xs text-secondary/70">{hint}</span>}
    </div>
  );
}

export function AreaField({ id, label, hint, disabled, value, onChange, placeholder, rows = 4, maxLength }: Base & { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; maxLength?: number }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Textarea id={id} rows={rows} className="w-full text-sm" value={value} disabled={disabled} maxLength={maxLength} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {hint && <span className="text-xs text-secondary/70">{hint}</span>}
    </div>
  );
}

const toLines = (list: string[]) => list.join("\n");
const fromLines = (v: string, max: number) => v.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, max);

/** A string[] edited as one line per item — the fastest way to type a list. */
export function LinesField({ id, label, hint, disabled, value, onChange, placeholder, rows = 4, max = 12 }: Base & { value: string[]; onChange: (v: string[]) => void; placeholder?: string; rows?: number; max?: number }) {
  return (
    <AreaField id={id} label={label} hint={hint ?? "One per line."} disabled={disabled} rows={rows} placeholder={placeholder} value={toLines(value)} onChange={(v) => onChange(fromLines(v, max))} />
  );
}

export function SelectField({ id, label, hint, disabled, value, onChange, options }: Base & { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect id={id} size="sm" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </NativeSelect>
      {hint && <span className="text-xs text-secondary/70">{hint}</span>}
    </div>
  );
}

/** Every brand form ends the same way: what it affects, then one save. */
export function SaveBar({ canEdit, dirty, pending, label = "Save" }: { canEdit: boolean; dirty: boolean; pending: boolean; label?: string }) {
  if (!canEdit) return <p className="text-xs text-secondary/70">Only owners and admins can change the brand. You can read it here.</p>;
  return (
    <div>
      <Button type="submit" color="primary" loading={pending} disabled={!dirty}>{label}</Button>
    </div>
  );
}

export function SectionIntro({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed text-secondary">{children}</p>;
}
