"use client";

import { useState } from "react";
import { Button, Input, Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@wizeworks/silicaui-react";
import { utcToZonedInput } from "@/lib/time";

type Props = { timezone: string; pending?: boolean; onSnooze: (untilLocal: string) => void };

/** Presets in workspace time; the custom field is a datetime-local string in that zone. */
function presets(tz: string): { label: string; value: string }[] {
  const now = Date.now();
  const at = (ms: number) => utcToZonedInput(new Date(ms), tz);
  const tomorrow9 = `${utcToZonedInput(new Date(now + 86_400_000), tz).slice(0, 10)}T09:00`;
  const d = new Date(now);
  const daysToMonday = ((8 - d.getUTCDay()) % 7) || 7;
  const monday9 = `${utcToZonedInput(new Date(now + daysToMonday * 86_400_000), tz).slice(0, 10)}T09:00`;
  return [
    { label: "In 1 hour", value: at(now + 3_600_000) },
    { label: "In 3 hours", value: at(now + 3 * 3_600_000) },
    { label: "Tomorrow, 9:00", value: tomorrow9 },
    { label: "Next Monday, 9:00", value: monday9 },
  ];
}

export function SnoozePopover({ timezone, pending, onSnooze }: Props) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const pick = (v: string) => { setOpen(false); onSnooze(v); };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger><Button size="xs" variant="ghost" color="neutral" disabled={pending}>Snooze</Button></PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3">
        <PopoverTitle className="text-sm font-semibold">Snooze until</PopoverTitle>
        <ul className="mt-2 flex flex-col">
          {presets(timezone).map((p) => (<li key={p.label}><button type="button" onClick={() => pick(p.value)} className="w-full rounded-field px-2 py-1.5 text-left text-sm hover:bg-base-200">{p.label}</button></li>))}
        </ul>
        <form className="mt-2 flex flex-col gap-2 border-t border-base-300 pt-2" onSubmit={(e) => { e.preventDefault(); if (custom) pick(custom); }}>
          <Input type="datetime-local" size="sm" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label={`Custom time (${timezone})`} />
          <div className="flex items-center justify-between"><span className="text-xs text-secondary/70">{timezone.replace("_", " ")}</span><Button type="submit" size="xs" color="primary" disabled={!custom}>Snooze</Button></div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
