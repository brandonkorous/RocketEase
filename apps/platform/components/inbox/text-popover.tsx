"use client";

import { useState } from "react";
import { Button, Input, Popover, PopoverContent, PopoverTitle, PopoverTrigger, Textarea } from "@wizeworks/silicaui-react";

type Props = {
  trigger: React.ReactElement;
  title: string;
  placeholder?: string;
  initial?: string;
  multiline?: boolean;
  submitLabel?: string;
  maxLength?: number;
  pending?: boolean;
  onSubmit: (value: string) => void;
};

/** Replaces `window.prompt`: a small anchored form with one text field. */
export function TextPopover({ trigger, title, placeholder, initial = "", multiline, submitLabel = "Save", maxLength = 2000, pending, onSubmit }: Props) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(initial);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = value.trim();
    if (!v) return;
    onSubmit(v);
    setValue("");
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setValue(initial); }}>
      <PopoverTrigger>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        <form onSubmit={submit} className="flex flex-col gap-2">
          <PopoverTitle className="text-sm font-semibold">{title}</PopoverTitle>
          {multiline ? (
            <Textarea rows={4} value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} maxLength={maxLength} className="w-full text-sm" autoFocus aria-label={title} />
          ) : (
            <Input size="sm" value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} maxLength={maxLength} autoFocus aria-label={title} />
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" size="xs" variant="ghost" color="neutral" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" size="xs" color="primary" loading={pending} disabled={!value.trim()}>{submitLabel}</Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
