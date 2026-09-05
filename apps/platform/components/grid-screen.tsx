"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@wizeworks/silicaui-react";
import type { Nav } from "@/components/calendar/types";
import { rescheduleItem } from "@/lib/actions/content";
import { scheduleDraftAt, swapSchedule } from "@/lib/actions/grid";
import type { GridData, GridGap, GridPost } from "@/lib/grid/types";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { DraftsTray } from "./grid/drafts";
import { longDay, time12 } from "./grid/format";
import { GridHeader } from "./grid/header";
import { SelectedPanel } from "./grid/panel";
import { GridPreview, type Drag } from "./grid/preview";
import { StatsRow } from "./grid/stats";
import { SurfaceTabs } from "./grid/tabs";

/** Every drop asks first: a move is a reschedule, and a reschedule re-queues real publish jobs. */
type Confirm =
  | { kind: "swap"; a: GridPost; b: GridPost }
  | { kind: "move"; post: GridPost; day: string; time: string }
  | { kind: "schedule"; itemId: string; title: string; day: string; time: string };

export function GridScreen({ data }: { data: GridData }) {
  const router = useRouter();
  const params = useSearchParams();
  const { run, pending } = useActionFeedback();
  const [drag, setDrag] = useState<Drag | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const nav: Nav = (patch) => { const next = new URLSearchParams(params.toString()); for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k); router.push(`?${next.toString()}`); };

  const onDropOnPost = (target: GridPost) => {
    if (drag?.kind === "post" && target.state === "scheduled" && target.variantId !== drag.post.variantId) setConfirm({ kind: "swap", a: drag.post, b: target });
    setDrag(null);
  };
  const onDropOnGap = (gap: GridGap) => {
    if (drag?.kind === "post") setConfirm({ kind: "move", post: drag.post, day: gap.localDay, time: drag.post.localTime ?? gap.localTime });
    if (drag?.kind === "draft") setConfirm({ kind: "schedule", itemId: drag.itemId, title: drag.title, day: gap.localDay, time: gap.localTime });
    setDrag(null);
  };
  const commit = (c: Confirm) => {
    setConfirm(null);
    if (c.kind === "swap") run(() => swapSchedule(data.workspaceId, c.a.itemId, c.b.itemId));
    if (c.kind === "move") run(() => rescheduleItem(data.workspaceId, c.post.itemId, `${c.day}T${c.time}`));
    if (c.kind === "schedule") run(() => scheduleDraftAt(data.workspaceId, c.itemId, `${c.day}T${c.time}`));
  };

  return (
    <div className="mx-auto w-full max-w-360 px-6 py-6 lg:px-8">
      <GridHeader data={data} nav={nav} />
      <StatsRow data={data} />
      <div className="mt-4 grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="min-w-0 rounded-box border border-base-300">
          <SurfaceTabs data={data} nav={nav} />
          <div className="flex justify-center p-6">
            <GridPreview data={data} drag={drag} setDrag={setDrag} onSelect={(p) => nav({ tile: p.variantId })} onDropOnPost={onDropOnPost} onDropOnGap={onDropOnGap} />
          </div>
        </div>
        <aside className="flex flex-col gap-4 xl:sticky xl:top-6 xl:self-start">
          {data.selected ? <SelectedPanel data={data} onClose={() => nav({ tile: null })} /> : <div className="rounded-box border border-dashed border-base-300 p-6 text-center text-sm text-secondary/70">Select a tile to see the post, its cover frame, and how to move it.</div>}
          <DraftsTray data={data} setDrag={setDrag} />
        </aside>
      </div>
      {confirm && <ConfirmDialog confirm={confirm} timezone={data.timezone} pending={pending} onKeep={() => setConfirm(null)} onCommit={() => commit(confirm)} />}
    </div>
  );
}

function ConfirmDialog({ confirm, timezone, pending, onKeep, onCommit }: { confirm: Confirm; timezone: string; pending: boolean; onKeep: () => void; onCommit: () => void }) {
  const copy = describe(confirm, timezone);
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="grid-confirm" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-105 rounded-box border border-base-300 bg-base-100 p-6">
        <h3 id="grid-confirm" className="text-lg font-bold">{copy.title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-secondary">{copy.body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" color="neutral" onClick={onKeep}>Keep</Button>
          <Button color="primary" loading={pending} onClick={onCommit}>{copy.action}</Button>
        </div>
      </div>
    </div>
  );
}

function describe(c: Confirm, tz: string): { title: string; body: React.ReactNode; action: string } {
  const when = (day: string, time: string) => `${longDay(day)} at ${time12(time)} (${tz})`;
  if (c.kind === "swap") return { title: "Swap these two posts?", body: <><strong>{c.a.title}</strong> takes {when(c.b.localDay!, c.b.localTime!)} and <strong>{c.b.title}</strong> takes {when(c.a.localDay!, c.a.localTime!)}. Every destination scheduled with each post moves with it.</>, action: "Swap" };
  if (c.kind === "move") return { title: "Move this post?", body: <><strong>{c.post.title}</strong> and every destination scheduled with it will move to {when(c.day, c.time)}.</>, action: "Move" };
  return { title: "Schedule this draft?", body: <><strong>{c.title}</strong> will be scheduled for {when(c.day, c.time)}, your usual posting time here. Approval rules still apply.</>, action: "Schedule" };
}
