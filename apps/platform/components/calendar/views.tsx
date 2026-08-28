"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, Checkbox } from "@wizeworks/silicaui-react";
import { workspacePath } from "@/lib/nav";
import { NetMark } from "../net-mark";
import { BulkBar } from "./bulk-bar";
import { DAY_NAMES, STATUS_COLOR, fmtDay, hourLabel, type CalendarData, type CalendarPost, type Nav } from "./types";

type DragProps = { draggable?: boolean; onDragStart?: () => void; onDragEnd?: () => void };
type ViewProps = { data: CalendarData; days: string[]; byDay: Map<string, CalendarPost[]>; dragging: boolean; dragProps: (p: CalendarPost) => DragProps; onDrop: (day: string, hour?: number) => void; nav: Nav };

export function WeekView({ data, days, byDay, hours, dragging, dragProps, onDrop }: ViewProps & { hours: number[] }) {
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-210" style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }}>
        <div className="border-b border-base-300 px-2 py-2 text-xs text-secondary/70">{data.timezone.split("/").pop()?.replace("_", " ")}</div>
        {days.map((d, i) => (<div key={d} className={`border-b border-l border-base-300 px-2 py-2 text-center text-xs ${d === data.today ? "font-bold" : "text-secondary"}`}>{DAY_NAMES[i]} <span className={d === data.today ? "rounded-full bg-base-content px-1.5 text-base-100" : ""}>{Number(d.slice(8, 10))}</span><span className="block text-xs font-normal text-secondary/70">{(byDay.get(d) ?? []).length || ""}</span></div>))}
        {hours.map((h) => (
          <div key={h} className="contents">
            <div className="border-b border-base-300 px-2 py-1 text-xs text-secondary/70">{hourLabel(h)}</div>
            {days.map((d) => (
              <div key={d + h} className="min-h-11 border-b border-l border-base-300 p-1" onDragOver={(e) => dragging && e.preventDefault()} onDrop={() => onDrop(d, h)}>
                {(byDay.get(d) ?? []).filter((p) => Number(p.localTime?.slice(0, 2)) === h).map((p) => (<PostChip key={p.variantId} post={p} workspaceId={data.workspaceId} {...dragProps(p)} />))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function MonthView({ data, days, byDay, dragging, dragProps, onDrop, nav }: ViewProps) {
  return (
    <div className="grid grid-cols-7">
      {DAY_NAMES.map((n) => (<div key={n} className="border-b border-base-300 px-2 py-2 text-center text-xs font-medium text-secondary">{n}</div>))}
      {days.map((d) => {
        const inMonth = d.slice(0, 7) === data.anchor.slice(0, 7);
        const items = byDay.get(d) ?? [];
        return (
          <div key={d} className={`min-h-26 border-b border-r border-base-300 p-1.5 ${inMonth ? "" : "bg-base-200/60"}`} onDragOver={(e) => dragging && e.preventDefault()} onDrop={() => onDrop(d)}>
            <div className={`mb-1 text-xs ${d === data.today ? "inline-block rounded-full bg-base-content px-1.5 font-bold text-base-100" : "text-secondary"}`}>{Number(d.slice(8, 10))}</div>
            {items.slice(0, 3).map((p) => (<PostChip key={p.variantId} post={p} workspaceId={data.workspaceId} compact {...dragProps(p)} />))}
            {items.length > 3 && <button type="button" onClick={() => nav({ view: "week", date: d })} className="text-xs text-secondary hover:underline">+{items.length - 3} more</button>}
          </div>
        );
      })}
    </div>
  );
}

export function ListView({ data }: { data: CalendarData }) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const schedulable = [...new Set(data.posts.filter((p) => p.status === "scheduled").map((p) => p.itemId))];
  const toggle = (itemId: string, on: boolean) => setChecked((c) => { const n = new Set(c); on ? n.add(itemId) : n.delete(itemId); return n; });
  return (
    <ul className="divide-y divide-base-300">
      {data.canPublish && schedulable.length > 0 && <li><BulkBar workspaceId={data.workspaceId} selected={[...checked]} total={schedulable.length} onToggleAll={(on) => setChecked(new Set(on ? schedulable : []))} onDone={() => setChecked(new Set())} /></li>}
      {data.posts.length === 0 && data.unscheduled.length === 0 && <li className="p-8 text-center text-sm text-secondary/70">Nothing here yet. Create a post to fill the calendar.</li>}
      {data.posts.map((p) => (
        <li key={p.variantId} className="flex items-center">
          {data.canPublish && schedulable.length > 0 && <span className="pl-4">{p.status === "scheduled" ? <Checkbox checked={checked.has(p.itemId)} onChange={(e) => toggle(p.itemId, e.target.checked)} aria-label={`Select ${p.title}`} /> : <span className="inline-block w-4" aria-hidden="true" />}</span>}
          <Link href={workspacePath(data.workspaceId, `posts/${p.itemId}`)} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 hover:bg-base-200">
            <span className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-base-200">{p.thumbUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.thumbUrl} alt="" className="h-full w-full object-cover" />}</span>
            <NetMark network={p.network} />
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{p.title}</span><span className="block truncate text-xs text-secondary/70">{p.text || "No text"}</span></span>
            <Badge size="xs" variant="soft" color={STATUS_COLOR[p.status] ?? "neutral"} className="capitalize">{p.status}</Badge>
            <span className="w-35 text-right text-xs text-secondary/70">{p.localDay ? `${fmtDay(p.localDay, { month: "short", day: "numeric" })} ${p.localTime}` : "—"}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function PostChip({ post, workspaceId, compact, ...drag }: { post: CalendarPost; workspaceId: string; compact?: boolean } & DragProps) {
  const border = post.status === "failed" ? "border-error" : "border-base-300";
  return (
    <Link href={workspacePath(workspaceId, `posts/${post.itemId}`)} {...drag} className={`mb-1 flex items-center gap-1.5 rounded-md border bg-base-100 px-1.5 py-1 text-xs hover:border-base-content ${border} ${post.status === "published" ? "opacity-80" : ""} ${drag.draggable ? "cursor-grab" : ""}`} title={`${post.channelName}: ${post.text}`}>
      <NetMark network={post.network} size={12} />
      <span className="font-semibold">{post.localTime}</span>
      {!compact && post.thumbUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={post.thumbUrl} alt="" className="ml-auto h-6 w-6 rounded object-cover" />}
      {compact && <span className="truncate text-secondary">{post.title}</span>}
    </Link>
  );
}
