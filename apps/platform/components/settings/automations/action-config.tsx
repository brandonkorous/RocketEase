"use client";

import { Checkbox, Input } from "@wizeworks/silicaui-react";
import type { WorkspaceRole } from "@/db/schema/app";
import type { RuleAction } from "@/db/schema/automations";
import type { AutomationOptions } from "@/lib/automations/queries";

type Props = { action: RuleAction; options: AutomationOptions; onChange: (a: RuleAction) => void };

const NOTIFY_ROLES: WorkspaceRole[] = ["owner", "admin", "manager", "creator", "responder"];
/** Round-robin only makes sense for roles that can hold a conversation. */
const ASSIGNABLE_ROLES: WorkspaceRole[] = ["responder", "manager", "admin", "creator", "owner"];
const label = (r: string) => r.replace("_", " ");

function UserSelect({ value, onChange, allowNone, options }: { value: string; onChange: (v: string) => void; allowNone?: string; options: AutomationOptions }) {
  return (
    <select aria-label="Person" className="select select-sm w-52" value={value} onChange={(e) => onChange(e.target.value)}>
      {allowNone && <option value="">{allowNone}</option>}
      {options.members.map((m) => (
        <option key={m.userId} value={m.userId}>{m.name} · {label(m.role)}</option>
      ))}
    </select>
  );
}

function InboxConfig({ action, options, onChange }: Props) {
  switch (action.kind) {
    case "inbox.assign":
      return <UserSelect value={action.userId} options={options} onChange={(userId) => onChange({ ...action, userId })} allowNone="Choose a person…" />;
    case "inbox.assign_round_robin":
      return (
        <select aria-label="Role" className="select select-sm w-44" value={action.role} onChange={(e) => onChange({ ...action, role: e.target.value as WorkspaceRole })}>
          {ASSIGNABLE_ROLES.map((r) => (
            <option key={r} value={r}>{label(r)}s</option>
          ))}
        </select>
      );
    case "inbox.set_priority":
      return (
        <select aria-label="Priority" className="select select-sm w-32" value={action.priority} onChange={(e) => onChange({ ...action, priority: e.target.value as typeof action.priority })}>
          {["low", "normal", "high", "urgent"].map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      );
    case "inbox.add_tag":
      return <Input aria-label="Tag" size="sm" className="w-44" maxLength={40} value={action.tag} placeholder="vip" onChange={(e) => onChange({ ...action, tag: e.target.value })} />;
    case "inbox.saved_reply":
      return (
        <span className="flex flex-wrap items-center gap-2">
          <select aria-label="Saved reply" className="select select-sm w-52" value={action.savedReplyId} onChange={(e) => onChange({ ...action, savedReplyId: e.target.value })}>
            <option value="">Choose a saved reply…</option>
            {options.savedReplies.map((r) => (
              <option key={r.id} value={r.id}>{r.title}</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-secondary">
            <Checkbox checked={Boolean(action.autoSend)} onChange={(e) => onChange({ ...action, autoSend: e.target.checked })} />
            Send without review
          </label>
        </span>
      );
    case "inbox.snooze":
      return (
        <span className="flex items-center gap-1.5 text-sm text-secondary">
          <Input aria-label="Hours" type="number" size="sm" className="w-24" min={1} max={720} value={String(action.hours)} onChange={(e) => onChange({ ...action, hours: Number(e.target.value) || 1 })} />
          hours
        </span>
      );
    default:
      return null;
  }
}

function NotifyConfig({ action, options, onChange }: { action: Extract<RuleAction, { kind: "notify" }>; options: AutomationOptions; onChange: (a: RuleAction) => void }) {
  const roles = action.roles ?? [];
  return (
    <span className="flex flex-wrap items-center gap-2">
      {NOTIFY_ROLES.map((r) => (
        <label key={r} className="flex items-center gap-1 text-xs text-secondary">
          <Checkbox checked={roles.includes(r)} onChange={(e) => onChange({ ...action, roles: e.target.checked ? [...roles, r] : roles.filter((x) => x !== r) })} />
          {label(r)}s
        </label>
      ))}
      <UserSelect value={action.userIds?.[0] ?? ""} options={options} allowNone="and nobody else" onChange={(id) => onChange({ ...action, userIds: id ? [id] : [] })} />
      <Input aria-label="Message" size="sm" className="w-52" maxLength={200} value={action.message ?? ""} placeholder="Optional message" onChange={(e) => onChange({ ...action, message: e.target.value })} />
    </span>
  );
}

function PostConfig({ action, options, onChange }: Props) {
  switch (action.kind) {
    case "notify":
      return <NotifyConfig action={action} options={options} onChange={onChange} />;
    case "publish.request_approval":
      return <UserSelect value={action.assigneeUserId ?? ""} options={options} allowNone="Any approver" onChange={(id) => onChange({ ...action, assigneeUserId: id || null })} />;
    case "publish.retry":
      return (
        <span className="flex items-center gap-1.5 text-sm text-secondary">
          <Input aria-label="Delay in minutes" type="number" size="sm" className="w-24" min={1} max={1440} value={action.delayMinutes ? String(action.delayMinutes) : ""} placeholder="auto" onChange={(e) => onChange({ ...action, delayMinutes: Number(e.target.value) || undefined })} />
          minutes later (blank = exponential backoff)
        </span>
      );
    case "campaign.pause_promotion":
      return <span className="text-xs text-secondary/70">Pauses only ad campaigns Make It Social created for this post.</span>;
    case "campaign.pause_ads":
      return <span className="text-xs text-secondary/70">Always asks for approval before spend stops.</span>;
    default:
      return null;
  }
}

/** The fields one action needs, and nothing more. */
export function ActionConfig(props: Props) {
  return props.action.kind.startsWith("inbox.") ? <InboxConfig {...props} /> : <PostConfig {...props} />;
}

/** A fresh action of the chosen kind with sane defaults. */
export function blankAction(kind: RuleAction["kind"]): RuleAction {
  switch (kind) {
    case "inbox.assign":
      return { kind, userId: "" };
    case "inbox.assign_round_robin":
      return { kind, role: "responder" };
    case "inbox.set_priority":
      return { kind, priority: "high" };
    case "inbox.add_tag":
      return { kind, tag: "" };
    case "inbox.saved_reply":
      return { kind, savedReplyId: "", autoSend: false };
    case "inbox.snooze":
      return { kind, hours: 24 };
    case "notify":
      return { kind, roles: ["manager"], userIds: [] };
    case "publish.request_approval":
      return { kind, assigneeUserId: null };
    case "publish.retry":
      return { kind };
    default:
      return { kind } as RuleAction;
  }
}
