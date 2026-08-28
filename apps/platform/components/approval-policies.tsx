"use client";

import { useState } from "react";
import { Badge, Button } from "@wizeworks/silicaui-react";
import type { WorkspaceRole } from "@/db/schema/app";
import { deletePolicy, savePolicy } from "@/lib/actions/approval-policies";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { PolicyForm, type PolicyDraft } from "./approval-policy-form";
import { ConfirmDialog } from "./confirm-dialog";

export type PolicyView = { id: string; name: string; enabled: boolean; channelIds: string[]; authorRoles: WorkspaceRole[]; approverRoles: WorkspaceRole[]; separationOfDuty: boolean; dueHours: number };

const blank = (): PolicyDraft => ({ name: "", enabled: true, channelIds: [], authorRoles: ["creator"], approverRoles: ["owner", "admin", "manager"], separationOfDuty: true, dueHours: 24 });

export function ApprovalPolicies({ workspaceId, policies, channels, canEdit }: { workspaceId: string; policies: PolicyView[]; channels: { id: string; name: string; network: string }[]; canEdit: boolean }) {
  const { run, pending } = useActionFeedback();
  const [editing, setEditing] = useState<PolicyDraft | null>(null);
  const save = (d: PolicyDraft) => run(() => savePolicy({ workspaceId, policyId: d.id, ...d }), (r) => { if (!r.error) setEditing(null); });
  const remove = (p: PolicyView) => run(() => deletePolicy(workspaceId, p.id));

  return (
    <section className="mt-8" aria-labelledby="policies-h">
      <div className="flex items-center justify-between"><h3 id="policies-h" className="text-base font-semibold">Approval policies</h3>{canEdit && !editing && <Button size="sm" color="primary" onClick={() => setEditing(blank())}>New policy</Button>}</div>
      <p className="mt-1 max-w-160 text-sm leading-relaxed text-secondary">A policy decides which posts must be approved before they can be scheduled, by channel or by who wrote them. The author can never satisfy their own request when separation of duty is on.</p>
      {editing && <PolicyForm draft={editing} channels={channels} pending={pending} onChange={setEditing} onSave={save} onCancel={() => setEditing(null)} />}
      <ul className="mt-4 divide-y divide-base-300 rounded-box border border-base-300">
        {policies.length === 0 && !editing && <li className="p-5 text-sm text-secondary/70">No policies yet. Anyone with publish rights can schedule directly; add one to require review.</li>}
        {policies.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-sm font-semibold">{p.name}{!p.enabled && <Badge size="xs" variant="soft" color="neutral">Off</Badge>}</span>
              <span className="block text-xs text-secondary">Posts by {p.authorRoles.length ? p.authorRoles.map((r) => r.replace("_", " ")).join(", ") : "anyone"} · {p.channelIds.length ? `${p.channelIds.length} channel${p.channelIds.length === 1 ? "" : "s"}` : "all channels"} · approvers: {p.approverRoles.map((r) => r.replace("_", " ")).join(", ")} · {p.dueHours}h{p.separationOfDuty ? " · SoD" : ""}</span>
            </span>
            {canEdit && (<><Button size="sm" variant="outline" color="neutral" onClick={() => setEditing({ ...p })}>Edit</Button><ConfirmDialog trigger={<Button size="sm" variant="ghost" color="error" disabled={pending}>Delete</Button>} title={`Delete policy "${p.name}"?`} description="Posts matching it will no longer require review before scheduling." confirmLabel="Delete" onConfirm={() => remove(p)} /></>)}
          </li>
        ))}
      </ul>
    </section>
  );
}
