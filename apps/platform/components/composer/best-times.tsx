"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@wizeworks/silicaui-react";
import { bestTimesFor } from "@/lib/actions/recommendations";
import type { BestTime } from "@/lib/recommendations/best-times";
import { nextOccurrence, slotLabel } from "@/lib/recommendations/slot-format";
import type { ComposerState } from "./use-composer";

/**
 * Best times for the selected channels, computed from published-post engagement
 * rate by weekday × hour (lib/recommendations/best-times.ts). Nothing is shown
 * until a channel has enough posts — the placeholder stays honest instead.
 */
export function BestTimes({ s, timezone }: { s: ComposerState; timezone: string }) {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [slots, setSlots] = useState<BestTime[] | null>(null);
  const key = [...s.selected].sort().join(",");

  useEffect(() => {
    let live = true;
    setSlots(null);
    const ids = key ? key.split(",") : [];
    if (!ids.length || !workspaceId) { setSlots([]); return; }
    void bestTimesFor(workspaceId, ids).then((r) => { if (live) setSlots(r); });
    return () => { live = false; };
  }, [key, workspaceId]);

  const use = (slot: BestTime) => {
    const when = nextOccurrence(slot, timezone);
    s.setDate(when.date);
    s.setTime(when.time);
  };

  return (
    <div className="mt-3 rounded-lg border border-base-300 p-3">
      <p className="text-sm font-semibold">Best times</p>
      <p className="text-xs text-secondary/70">From this workspace&rsquo;s own published posts</p>
      {slots === null && <p className="mt-2 text-xs text-secondary/70">Loading…</p>}
      {slots?.length === 0 && (
        <p className="mt-2 rounded-field bg-base-200 px-3 py-2 text-xs text-secondary">Not enough data yet. A channel needs at least 15 published posts with reach, and 3 in the same weekday and hour, before a slot is scored.</p>
      )}
      {slots && slots.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {slots.map((slot) => (
            <li key={`${slot.channelId}-${slot.weekday}-${slot.hour}`} className="flex items-center gap-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">{slotLabel(slot)}</span>
                <span className="block text-xs text-secondary/70">{(slot.score * 100).toFixed(1)}% engagement rate · {slot.sampleSize} post{slot.sampleSize === 1 ? "" : "s"}</span>
              </span>
              <Button size="xs" variant="outline" color="neutral" onClick={() => use(slot)}>Use this time</Button>
            </li>
          ))}
        </ul>
      )}
      {slots && slots.length > 0 && <p className="mt-2 text-xs text-secondary/70">Engagement ÷ reach, averaged per post, in {timezone.replace("_", " ")}.</p>}
    </div>
  );
}
