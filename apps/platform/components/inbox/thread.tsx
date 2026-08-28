"use client";

import Link from "next/link";
import { Avatar, Badge, Button } from "@wizeworks/silicaui-react";
import type { ConversationDetailData } from "@/lib/engagement/detail";
import { assignConversation, setConversationPriority, setConversationStatus } from "@/lib/actions/inbox";
import { workspacePath } from "@/lib/nav";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { NetMark } from "../net-mark";
import { ReplyComposer } from "./composer";
import { MessageList } from "./message-list";
import { STATUS_BADGE, type InboxScreenData } from "./types";

function Controls({ data, d }: { data: InboxScreenData; d: ConversationDetailData }) {
  const { run, pending } = useActionFeedback();
  const ws = data.workspaceId;
  const snooze = () => {
    const until = window.prompt("Snooze until (YYYY-MM-DDTHH:MM, workspace time)", new Date(Date.now() + 86_400_000).toISOString().slice(0, 16));
    if (until) run(() => setConversationStatus(ws, d.id, "snoozed", until));
  };
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-base-300 px-4 py-2">
      <label className="flex items-center gap-1.5 text-xs text-secondary">Assign to
        <select className="select select-xs w-auto" value={d.assigneeUserId ?? ""} onChange={(e) => run(() => assignConversation(ws, d.id, e.target.value || null))} aria-label="Assignee" disabled={pending}>
          <option value="">Unassigned</option>{data.agents.map((a) => (<option key={a.userId} value={a.userId}>{a.name}</option>))}
        </select>
      </label>
      <label className="flex items-center gap-1.5 text-xs text-secondary">Priority
        <select className="select select-xs w-auto" value={d.priority} onChange={(e) => run(() => setConversationPriority(ws, d.id, e.target.value))} aria-label="Priority" disabled={pending}>
          <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
        </select>
      </label>
      <span className="flex-1" />
      {d.status === "resolved" ? (
        <Button size="xs" variant="outline" color="neutral" loading={pending} onClick={() => run(() => setConversationStatus(ws, d.id, "open"))}>Reopen</Button>
      ) : (
        <>
          <Button size="xs" variant="ghost" color="neutral" disabled={pending} onClick={snooze}>Snooze</Button>
          <Button size="xs" variant="outline" color="neutral" loading={pending} onClick={() => run(() => setConversationStatus(ws, d.id, "resolved"))}>Resolve</Button>
        </>
      )}
    </div>
  );
}

function PrevNext({ data, id }: { data: InboxScreenData; id: string }) {
  const ids = data.rows.map((r) => r.id);
  const i = ids.indexOf(id);
  const prev = i > 0 ? ids[i - 1] : null;
  const next = i >= 0 && i < ids.length - 1 ? ids[i + 1] : null;
  const cls = (on: boolean) => `rounded-field border border-base-300 px-2 py-1 text-xs ${on ? "hover:bg-base-200" : "pointer-events-none opacity-40"}`;
  return (
    <div className="flex items-center gap-1">
      <Link aria-label="Previous conversation" href={prev ? workspacePath(data.workspaceId, `inbox/${prev}`) : "#"} className={cls(!!prev)}>‹</Link>
      <Link aria-label="Next conversation" href={next ? workspacePath(data.workspaceId, `inbox/${next}`) : "#"} className={cls(!!next)}>›</Link>
    </div>
  );
}

export function ConversationThread({ data, d }: { data: InboxScreenData; d: ConversationDetailData }) {
  const st = STATUS_BADGE[d.status] ?? STATUS_BADGE.open;
  return (
    <section className="flex min-h-0 flex-col rounded-box border border-base-300" aria-label="Conversation">
      <div className="flex items-center gap-3 border-b border-base-300 px-4 py-3">
        <Link href={workspacePath(data.workspaceId, "inbox")} className="text-sm lg:hidden" aria-label="Back to inbox">←</Link>
        <Avatar size="md" color="neutral" alt="" src={d.contact.avatarUrl ?? undefined}>{d.contact.name.slice(0, 2).toUpperCase()}</Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><span className="truncate text-base font-bold">{d.contact.name}</span><Badge size="xs" variant="soft" color={st.color}>{st.label}</Badge>{d.overdue && <Badge size="xs" variant="soft" color="error">Past response target</Badge>}</div>
          <div className="flex flex-wrap items-center gap-x-1.5 text-xs text-secondary"><NetMark network={d.channel.network} size={12} /><span className="truncate">{d.channel.name}{d.contact.handle ? ` • ${d.contact.handle}` : ""} • {d.kindLabel}</span>{d.postUrl && <a href={d.postUrl} target="_blank" rel="noreferrer" className="hover:underline">• View post ↗</a>}</div>
        </div>
        <PrevNext data={data} id={d.id} />
      </div>
      {data.canHandle && <Controls data={data} d={d} />}
      {d.snoozedUntil && <div className="border-b border-base-300 bg-warning/10 px-4 py-2 text-xs">Snoozed until {d.snoozedUntil}. A new customer message reopens it.</div>}
      {d.responseDue && d.status === "open" && <div className={`border-b border-base-300 px-4 py-2 text-xs ${d.overdue ? "bg-error/10 text-error" : "text-secondary"}`}>First response due {d.responseDue}</div>}
      <div className="min-h-0 flex-1 overflow-y-auto"><MessageList d={d} workspaceId={data.workspaceId} /></div>
      <ReplyComposer d={d} workspaceId={data.workspaceId} canHandle={data.canHandle} />
    </section>
  );
}
