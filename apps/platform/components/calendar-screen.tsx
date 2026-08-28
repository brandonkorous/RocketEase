"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Textarea } from "@wizeworks/silicaui-react";
import { buttonClasses } from "@wizeworks/silicaui-react/server";
import { rescheduleItem } from "@/lib/actions/content";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { workspacePath } from "@/lib/nav";
import { addDays, fmtDay, type CalendarData, type CalendarPost, type Nav } from "./calendar/types";
import { ListView, MonthView, WeekView } from "./calendar/views";

export type { CalendarData, CalendarPost } from "./calendar/types";

export function CalendarScreen({ data }: { data: CalendarData }) {
  const router = useRouter();
  const params = useSearchParams();
  const { run, pending } = useActionFeedback();
  const [drag, setDrag] = useState<CalendarPost | null>(null);
  const [confirm, setConfirm] = useState<{ post: CalendarPost; day: string; time: string } | null>(null);

  const nav: Nav = (patch) => { const next = new URLSearchParams(params.toString()); for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k); router.push(`?${next.toString()}`); };
  const dayCount = data.view === "month" ? Math.round((new Date(`${data.rangeEnd}T00:00:00Z`).getTime() - new Date(`${data.rangeStart}T00:00:00Z`).getTime()) / 86_400_000) : 7;
  const days = useMemo(() => Array.from({ length: dayCount }, (_, i) => addDays(data.rangeStart, i)), [data.rangeStart, dayCount]);
  const hours = useMemo(() => { const hs = data.posts.map((p) => Number(p.localTime?.slice(0, 2))).filter((h) => !Number.isNaN(h)); const lo = Math.min(7, ...hs), hi = Math.max(21, ...hs); return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i); }, [data.posts]);
  const byDay = useMemo(() => { const m = new Map<string, CalendarPost[]>(); for (const p of data.posts) if (p.localDay) m.set(p.localDay, [...(m.get(p.localDay) ?? []), p]); return m; }, [data.posts]);

  const onDrop = (day: string, hour?: number) => {
    if (!drag || !data.canPublish || drag.status !== "scheduled") return setDrag(null);
    const time = hour !== undefined ? `${String(hour).padStart(2, "0")}:${drag.localTime?.slice(3, 5) ?? "00"}` : (drag.localTime ?? "09:00");
    setConfirm({ post: drag, day, time });
    setDrag(null);
  };
  const dragProps = (p: CalendarPost) => (data.canPublish && p.status === "scheduled" ? { draggable: true, onDragStart: () => setDrag(p), onDragEnd: () => setDrag(null) } : {});
  const viewProps = { data, days, byDay, dragging: Boolean(drag), dragProps, onDrop, nav };

  return (
    <div className="mx-auto w-full max-w-360 px-6 py-5 lg:px-8">
      <Toolbar data={data} nav={nav} />
      <StatsRow data={data} nav={nav} />
      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_300px]">
        <div className="min-w-0 rounded-box border border-base-300">
          {data.view === "week" && <WeekView {...viewProps} hours={hours} />}
          {data.view === "month" && <MonthView {...viewProps} />}
          {data.view === "list" && <ListView data={data} />}
        </div>
        <RightRail data={data} />
      </div>
      {confirm && (
        <div role="dialog" aria-modal="true" aria-labelledby="rs-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-105 rounded-box border border-base-300 bg-base-100 p-6">
            <h3 id="rs-title" className="text-lg font-bold">Move this post?</h3>
            <p className="mt-2 text-sm leading-relaxed text-secondary"><strong>{confirm.post.title}</strong> and every destination scheduled with it will move to <strong>{fmtDay(confirm.day, { weekday: "short", month: "short", day: "numeric" })} at {confirm.time}</strong> ({data.timezone}).</p>
            <div className="mt-5 flex justify-end gap-2"><Button variant="ghost" color="neutral" onClick={() => setConfirm(null)}>Keep</Button><Button color="primary" loading={pending} onClick={() => { const c = confirm; setConfirm(null); run(() => rescheduleItem(data.workspaceId, c.post.itemId, `${c.day}T${c.time}`)); }}>Move</Button></div>
          </div>
        </div>
      )}
    </div>
  );
}

function Toolbar({ data, nav }: { data: CalendarData; nav: Nav }) {
  const shiftMonth = (n: number) => { const d = new Date(`${data.anchor.slice(0, 7)}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
  const shift = (n: number) => nav({ date: data.view === "month" ? shiftMonth(n) : addDays(data.anchor, n * 7) });
  const label = data.view === "month" ? fmtDay(`${data.anchor.slice(0, 7)}-01`, { month: "long", year: "numeric" }) : data.view === "week" ? `${fmtDay(data.rangeStart, { month: "short", day: "numeric" })} – ${fmtDay(addDays(data.rangeEnd, -1), { month: "short", day: "numeric", year: "numeric" })}` : "Upcoming";
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div><h1 className="app-title">Calendar</h1><p className="mt-1 text-base text-secondary">Plan, create, and organize content across all platforms.</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-field border border-base-300"><button type="button" className="px-2.5 py-2 text-secondary hover:bg-base-200" onClick={() => shift(-1)} aria-label="Previous">‹</button><span className="px-2 text-sm font-medium">{label}</span><button type="button" className="px-2.5 py-2 text-secondary hover:bg-base-200" onClick={() => shift(1)} aria-label="Next">›</button></div>
        <Button variant="outline" color="neutral" size="sm" onClick={() => nav({ date: null })}>Today</Button>
        <select className="select select-sm w-auto" value={data.filters.channel} onChange={(e) => nav({ channel: e.target.value || null })} aria-label="Filter by channel"><option value="">All channels</option>{data.channels.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}</select>
        <select className="select select-sm w-auto" value={data.filters.status} onChange={(e) => nav({ status: e.target.value || null })} aria-label="Filter by status"><option value="">All statuses</option><option value="draft">Drafts</option><option value="scheduled">Scheduled</option><option value="published">Published</option><option value="failed">Failed</option></select>
        <label className="flex h-9 items-center gap-2 rounded-field border border-base-300 px-3 text-sm"><span className="text-secondary/70">View</span><select className="bg-transparent font-medium outline-none" value={data.view} onChange={(e) => nav({ view: e.target.value })} aria-label="View"><option value="week">Week</option><option value="month">Month</option><option value="list">List</option></select></label>
        {data.canCreate && <Link href={workspacePath(data.workspaceId, "create")} className={buttonClasses({ color: "primary" })}>+ Create post</Link>}
      </div>
    </div>
  );
}

function StatsRow({ data, nav }: { data: CalendarData; nav: Nav }) {
  const cells: [string, number, string | null][] = [["Scheduled", data.stats.scheduled, "scheduled"], ["Drafts", data.stats.drafts, "draft"], ["Under review", data.stats.underReview, null], ["Needs changes", data.stats.needsChanges + data.stats.failed, "failed"], ["Published", data.stats.published, "published"]];
  return (
    <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_260px]">
      <div className="grid grid-cols-2 divide-base-300 rounded-box border border-base-300 sm:grid-cols-3 lg:grid-cols-5 lg:divide-x">
        {cells.map(([label, n, filter]) => (<button key={label} type="button" onClick={() => nav({ status: filter, view: "list" })} className="flex items-center gap-3 px-4 py-3 text-left hover:bg-base-200"><span className="text-2xl font-bold leading-none">{n}</span><span className="text-sm text-secondary">{label}</span></button>))}
      </div>
      <div className="rounded-box border border-base-300 px-4 py-3"><div className="text-sm text-secondary">Content health</div><div className="mt-1 flex items-center gap-3"><span className="text-2xl font-bold leading-none">{data.stats.failed === 0 ? "Good" : `${data.stats.failed} failed`}</span><span className="text-xs text-secondary/70">{data.stats.failed === 0 ? "No failed posts" : "Open Needs changes"}</span></div></div>
    </div>
  );
}

function RightRail({ data }: { data: CalendarData }) {
  const [text, setText] = useState("");
  return (
    <aside className="flex flex-col gap-4">
      {data.canCreate && (
        <section className="rounded-box border border-base-300 p-4" aria-labelledby="qc-h">
          <h2 id="qc-h" className="text-sm font-semibold">Create post</h2>
          <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Start with an idea…" className="mt-2 w-full text-sm" />
          <Link href={workspacePath(data.workspaceId, `create${text ? `?text=${encodeURIComponent(text)}` : ""}`)} className={`${buttonClasses({ color: "primary", size: "sm" })} mt-2 w-full`}>Open composer</Link>
        </section>
      )}
      <section className="rounded-box border border-base-300 p-4" aria-labelledby="unsched-h">
        <h2 id="unsched-h" className="text-sm font-semibold">Unscheduled drafts <span className="font-normal text-secondary/70">({data.unscheduled.length})</span></h2>
        <ul className="mt-2 flex flex-col divide-y divide-base-300">
          {data.unscheduled.map((u) => (<li key={u.itemId}><Link href={workspacePath(data.workspaceId, `create?item=${u.itemId}`)} className="block py-2 hover:bg-base-200"><span className="block truncate text-sm font-medium">{u.title}</span><span className="block truncate text-xs text-secondary/70">{u.text || "No text yet"}</span></Link></li>))}
          {data.unscheduled.length === 0 && <li className="py-2 text-xs text-secondary/70">All drafts are scheduled.</li>}
        </ul>
      </section>
    </aside>
  );
}
