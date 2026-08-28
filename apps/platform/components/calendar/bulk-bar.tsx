"use client";

import { useState } from "react";
import { Button, Checkbox, Input } from "@wizeworks/silicaui-react";
import { bulkShiftSchedule, type BulkResult } from "@/lib/actions/content";
import { useActionFeedback } from "@/lib/use-action-feedback";

type Props = { workspaceId: string; selected: string[]; total: number; onToggleAll: (on: boolean) => void; onDone: () => void };

/** Bulk reschedule: shift every selected scheduled post by the same offset (PUB-006). */
export function BulkBar({ workspaceId, selected, total, onToggleAll, onDone }: Props) {
  const { run, pending } = useActionFeedback();
  const [days, setDays] = useState("1");
  const [hours, setHours] = useState("0");
  const [results, setResults] = useState<NonNullable<BulkResult["results"]> | null>(null);
  const d = Number(days) || 0, h = Number(hours) || 0;
  const shift = () => run(() => bulkShiftSchedule({ workspaceId, itemIds: selected, days: d, hours: h }), (r) => { setResults(r.results ?? null); if (!r.error) onDone(); });
  const label = `${d ? `${d > 0 ? "+" : ""}${d}d` : ""}${h ? ` ${h > 0 ? "+" : ""}${h}h` : ""}`.trim() || "0";
  return (
    <div className="border-b border-base-300 bg-base-200 px-4 py-2 text-sm" role="region" aria-label="Bulk actions">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2"><Checkbox checked={selected.length === total && total > 0} onChange={(e) => onToggleAll(e.target.checked)} aria-label="Select all scheduled posts" /><span>{selected.length} of {total} scheduled selected</span></label>
        <span className="flex-1" />
        <label className="flex items-center gap-1.5 text-xs text-secondary">Days<Input type="number" size="sm" value={days} onChange={(e) => setDays(e.target.value)} min={-365} max={365} className="w-20" aria-label="Shift by days" /></label>
        <label className="flex items-center gap-1.5 text-xs text-secondary">Hours<Input type="number" size="sm" value={hours} onChange={(e) => setHours(e.target.value)} min={-23} max={23} className="w-20" aria-label="Shift by hours" /></label>
        <Button size="sm" color="primary" loading={pending} disabled={selected.length === 0 || (d === 0 && h === 0)} onClick={shift}>Shift by {label}</Button>
        <Button size="sm" variant="ghost" color="neutral" disabled={pending} onClick={() => onToggleAll(false)}>Clear</Button>
      </div>
      {results && results.some((r) => !r.ok) && (
        <ul className="mt-2 flex flex-col gap-0.5 text-xs">{results.filter((r) => !r.ok).map((r) => (<li key={r.itemId} className="text-error"><strong>{r.title}</strong>: {r.message}</li>))}</ul>
      )}
    </div>
  );
}
