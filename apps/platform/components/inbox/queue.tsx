"use client";

import Link from "next/link";
import { Avatar } from "@wizeworks/silicaui-react";
import type { ConversationRow } from "@/lib/engagement/queries";
import { workspacePath } from "@/lib/nav";
import { NetMark } from "../net-mark";
import { TABS, type InboxScreenData, type Nav } from "./types";

function rowHref(data: InboxScreenData, id: string) {
  const q = new URLSearchParams();
  const f = data.filters;
  if (f.tab !== "all") q.set("tab", f.tab);
  if (f.status !== "open") q.set("status", f.status);
  if (f.channel) q.set("channel", f.channel);
  if (f.assignee) q.set("assignee", f.assignee);
  if (f.sort !== "newest") q.set("sort", f.sort);
  if (f.q) q.set("q", f.q);
  const s = q.toString();
  return workspacePath(data.workspaceId, `inbox/${id}${s ? `?${s}` : ""}`);
}

function Row({ r, href, active }: { r: ConversationRow; href: string; active: boolean }) {
  return (
    <li>
      <Link href={href} className={`flex items-start gap-3 px-4 py-3 ${active ? "bg-base-200" : "hover:bg-base-200/50"}`} aria-current={active ? "true" : undefined}>
        <span className="relative shrink-0">
          <Avatar size="sm" color="neutral" alt="" src={r.contact.avatarUrl ?? undefined}>{r.contact.name.slice(0, 2).toUpperCase()}</Avatar>
          <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-base-100 p-px"><NetMark network={r.channel.network} size={14} /></span>
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm ${r.unread ? "font-semibold" : "font-medium"}`}>{r.contact.name}</span>
          <span className={`block truncate text-sm ${r.unread ? "text-base-content" : "text-secondary"}`}>{r.preview || "(no text)"}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className={`text-xs ${r.overdue ? "font-medium text-error" : "text-secondary/70"}`}>{r.lastAt}</span>
          {r.unread > 0 && <span className="rounded-full bg-base-content px-1.5 text-xs font-semibold text-base-100">{r.unread}</span>}
          {r.priority === "urgent" && <span className="text-xs font-semibold text-error">Urgent</span>}
        </span>
      </Link>
    </li>
  );
}

export function InboxQueue({ data, nav }: { data: InboxScreenData; nav: Nav }) {
  const f = data.filters;
  return (
    <section className="flex min-h-0 flex-col rounded-box border border-base-300" aria-label="Conversation queue">
      <div className="flex items-center justify-between gap-2 px-4 pt-3">
        <h2 className="text-base font-bold">Inbox</h2>
        <div className="flex items-center gap-2">
          <select className="select select-sm w-auto" value={f.channel} onChange={(e) => nav({ channel: e.target.value || null })} aria-label="Channel">
            <option value="">All channels</option>
            {data.channels.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
          </select>
          <select className="select select-sm w-auto" value={f.status} onChange={(e) => nav({ status: e.target.value })} aria-label="Status">
            <option value="open">Open</option><option value="snoozed">Snoozed</option><option value="resolved">Resolved</option><option value="all">Everything</option>
          </select>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between border-b border-base-300 px-4">
        <div className="flex flex-wrap gap-x-4 gap-y-1" role="tablist">
          {TABS.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={f.tab === t.key} onClick={() => nav({ tab: t.key === "all" ? null : t.key })} className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 py-2 text-sm ${f.tab === t.key ? "border-base-content font-semibold" : "border-transparent text-secondary"}`}>
              {t.label}{t.key === "unread" && data.counts.unread > 0 && <span className="rounded-full bg-base-content px-1.5 text-xs font-semibold text-base-100">{data.counts.unread}</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 px-4 py-2 text-xs text-secondary">
        <input className="input input-xs w-full max-w-45" placeholder="Search" defaultValue={f.q} aria-label="Search conversations" onKeyDown={(e) => { if (e.key === "Enter") nav({ q: (e.target as HTMLInputElement).value || null }); }} />
        <select className="select select-xs w-auto" value={f.sort} onChange={(e) => nav({ sort: e.target.value === "newest" ? null : e.target.value })} aria-label="Sort">
          <option value="newest">Newest</option><option value="oldest">Oldest</option><option value="due">Response due</option>
        </select>
      </div>
      <ul className="min-h-0 flex-1 divide-y divide-base-300 overflow-y-auto">
        {data.rows.length === 0 && <li className="p-8 text-center text-sm text-secondary/70">{f.status === "open" ? "No open conversations. Nice work." : "Nothing here."}</li>}
        {data.rows.map((r) => (<Row key={r.id} r={r} href={rowHref(data, r.id)} active={data.detail?.id === r.id} />))}
      </ul>
    </section>
  );
}
