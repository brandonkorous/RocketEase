"use client";

import { useState } from "react";
import { Avatar, Button } from "@wizeworks/silicaui-react";
import type { ConversationDetailData } from "@/lib/engagement/detail";
import { addInternalNote, assignConversation, setContactTags, updateContact } from "@/lib/actions/inbox";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { NetMark } from "../net-mark";
import { TextPopover } from "./text-popover";
import type { InboxScreenData } from "./types";

const TAG_COLORS = ["bg-info/10 text-info", "bg-success/10 text-success", "bg-warning/10 text-warning", "bg-base-200 text-base-content"];

function ContactFields({ d, workspaceId, canHandle }: { d: ConversationDetailData; workspaceId: string; canHandle: boolean }) {
  const { run, pending } = useActionFeedback();
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState(d.contact.email ?? "");
  const [location, setLocation] = useState(d.contact.location ?? "");
  if (editing) {
    return (
      <form className="mt-3 flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); run(() => updateContact(workspaceId, d.contact.id, { email, location }), (r) => { if (!r.error) setEditing(false); }); }}>
        <input className="input input-sm" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" aria-label="Email" />
        <input className="input input-sm" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location" aria-label="Location" />
        <div className="flex gap-2"><Button type="submit" size="xs" color="primary" loading={pending}>Save</Button><Button size="xs" variant="ghost" color="neutral" onClick={() => setEditing(false)}>Cancel</Button></div>
      </form>
    );
  }
  return (
    <dl className="mt-3 flex flex-col gap-1.5 text-sm">
      <div className="flex gap-2"><dt className="w-4 text-secondary/70" aria-label="Location">⌖</dt><dd>{d.contact.location ?? <span className="text-secondary/70">No location</span>}</dd></div>
      <div className="flex gap-2"><dt className="w-4 text-secondary/70" aria-label="Email">✉</dt><dd className="truncate">{d.contact.email ?? <span className="text-secondary/70">No email</span>}</dd></div>
      <div className="flex gap-2"><dt className="w-4 text-secondary/70" aria-label="Customer since">▣</dt><dd>Customer since {d.contact.since}</dd></div>
      {canHandle && <button type="button" className="self-start text-xs text-info hover:underline" onClick={() => setEditing(true)}>Edit details</button>}
    </dl>
  );
}

function Tags({ d, workspaceId, canHandle }: { d: ConversationDetailData; workspaceId: string; canHandle: boolean }) {
  const { run, pending } = useActionFeedback();
  const add = (t: string) => run(() => setContactTags(workspaceId, d.contact.id, [...d.contact.tags, t]));
  return (
    <div className="mt-4 border-t border-base-300 pt-4">
      <h4 className="text-sm font-semibold">Details</h4>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {d.contact.tags.map((t, i) => (
          <span key={t} className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${TAG_COLORS[i % TAG_COLORS.length]}`}>{t}{canHandle && <button type="button" aria-label={`Remove ${t}`} className="opacity-60 hover:opacity-100" onClick={() => run(() => setContactTags(workspaceId, d.contact.id, d.contact.tags.filter((x) => x !== t)))}>×</button>}</span>
        ))}
        {canHandle && <TextPopover trigger={<button type="button" className="flex h-6 w-6 items-center justify-center rounded-full border border-base-300 text-sm hover:bg-base-200" aria-label="Add tag">+</button>} title="Add a tag" placeholder="e.g. Lead, VIP" maxLength={30} submitLabel="Add" pending={pending} onSubmit={add} />}
        {d.contact.tags.length === 0 && !canHandle && <span className="text-xs text-secondary/70">No tags</span>}
      </div>
    </div>
  );
}

function Notes({ d, workspaceId, canHandle }: { d: ConversationDetailData; workspaceId: string; canHandle: boolean }) {
  const { run, pending } = useActionFeedback();
  const add = (t: string) => run(() => addInternalNote(workspaceId, d.id, t));
  return (
    <div className="mt-4 border-t border-base-300 pt-4">
      <div className="flex items-center justify-between"><h4 className="text-sm font-semibold">Notes</h4>{canHandle && <TextPopover trigger={<button type="button" className="text-xs text-secondary hover:underline">Add note</button>} title="Internal note" placeholder="Only your team sees this" multiline submitLabel="Add note" pending={pending} onSubmit={add} />}</div>
      <ul className="mt-2 flex flex-col gap-2">
        {d.notes.slice(0, 4).map((n) => (<li key={n.id} className="rounded-field bg-warning/10 p-3 text-sm"><div className="text-xs text-secondary">{n.by} • {n.at}</div><p className="mt-1 whitespace-pre-wrap">{n.body}</p></li>))}
        {d.notes.length === 0 && <li className="text-xs text-secondary/70">No notes yet.</li>}
      </ul>
    </div>
  );
}

export function ContextPanel({ data, d }: { data: InboxScreenData; d: ConversationDetailData }) {
  const { run } = useActionFeedback();
  const first = d.contact.name.split(" ")[0];
  return (
    <aside className="hidden min-h-0 overflow-y-auto rounded-box border border-base-300 p-4 xl:block" aria-label="Customer context">
      <h3 className="text-base font-bold">About {first}</h3>
      <div className="mt-3 flex items-center gap-3">
        <Avatar size="lg" color="neutral" alt="" src={d.contact.avatarUrl ?? undefined}>{d.contact.name.slice(0, 2).toUpperCase()}</Avatar>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{d.contact.name}</div>
          {d.contact.handle && (d.contact.profileUrl ? <a href={d.contact.profileUrl} target="_blank" rel="noreferrer" className="block truncate text-xs text-secondary hover:underline">{d.contact.handle} ↗</a> : <div className="truncate text-xs text-secondary">{d.contact.handle}</div>)}
          <div className="flex items-center gap-1 text-xs text-secondary"><NetMark network={d.contact.network} size={12} />{d.channel.name}</div>
        </div>
      </div>
      <ContactFields d={d} workspaceId={data.workspaceId} canHandle={data.canHandle} />
      <Tags d={d} workspaceId={data.workspaceId} canHandle={data.canHandle} />
      <div className="mt-4 flex items-center justify-between border-t border-base-300 pt-4">
        <span className="text-sm font-semibold">Assigned to</span>
        {data.canHandle ? (
          <select className="select select-sm w-auto" value={d.assigneeUserId ?? ""} onChange={(e) => run(() => assignConversation(data.workspaceId, d.id, e.target.value || null))} aria-label="Assignee"><option value="">Unassigned</option>{data.agents.map((a) => (<option key={a.userId} value={a.userId}>{a.name}</option>))}</select>
        ) : (<span className="text-sm">{data.agents.find((a) => a.userId === d.assigneeUserId)?.name ?? "Unassigned"}</span>)}
      </div>
      <div className="mt-4 border-t border-base-300 pt-4">
        <h4 className="text-sm font-semibold">Recent activity</h4>
        <ul className="mt-2 flex flex-col gap-1.5">{d.activity.map((a) => (<li key={a.id} className="flex items-center gap-2 text-xs"><NetMark network={a.network} size={12} /><span className="flex-1">{a.label}</span><span className="text-secondary/70">{a.at}</span></li>))}{d.activity.length === 0 && <li className="text-xs text-secondary/70">No activity yet.</li>}</ul>
      </div>
      <Notes d={d} workspaceId={data.workspaceId} canHandle={data.canHandle} />
    </aside>
  );
}
