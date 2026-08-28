"use client";

import { useActionState, useEffect, useState } from "react";
import { Avatar, Badge, Button, Input, Label, NativeSelect, Table } from "@wizeworks/silicaui-react";
import { WORKSPACE_ROLES, type WorkspaceRole } from "@/db/schema/app";
import { inviteMember, removeMember, revokeInvitation, updateMemberRole, type ActionState } from "@/lib/actions/team";
import { useActionFeedback } from "@/lib/use-action-feedback";

export type MemberRow = { id: string; userId: string; name: string; email: string; image?: string | null; role: WorkspaceRole; grants: string[]; isYou: boolean };
export type InvitationRow = { id: string; email: string; role: WorkspaceRole; expiresAt: string; invitedBy: string | null };
type Props = { workspaceId: string; members: MemberRow[]; invitations: InvitationRow[]; canManage: boolean; myRole: WorkspaceRole };

const ROLE_HELP: Record<WorkspaceRole, string> = {
  owner: "Billing, settings, everything.", admin: "Settings, members, channels, publishing, approvals.", manager: "Publish, approve, campaigns, inbox. Settings if granted.",
  creator: "Draft content; publish per policy.", responder: "Handle conversations.", analyst: "Analytics and exports.", client_approver: "Approve only what they're assigned.", viewer: "Read-only analytics.",
};
const label = (r: string) => r.replace("_", " ");

export function TeamPanel({ workspaceId, members, invitations, canManage, myRole }: Props) {
  const roles = myRole === "owner" ? WORKSPACE_ROLES : WORKSPACE_ROLES.filter((r) => r !== "owner");
  return (
    <div className="mt-8 flex flex-col gap-10">
      {canManage && <InviteForm workspaceId={workspaceId} roles={roles} />}
      <MembersTable workspaceId={workspaceId} members={members} roles={roles} canManage={canManage} myRole={myRole} />
      {invitations.length > 0 && <InvitationsTable workspaceId={workspaceId} invitations={invitations} canManage={canManage} />}
    </div>
  );
}

function InviteForm({ workspaceId, roles }: { workspaceId: string; roles: readonly WorkspaceRole[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(inviteMember, {});
  const [role, setRole] = useState<WorkspaceRole>("creator");
  const { notify } = useActionFeedback();
  useEffect(() => notify(state), [state, notify]);
  return (
    <section aria-labelledby="invite-heading" className="rounded-box border border-base-300 p-6">
      <h2 id="invite-heading" className="text-base font-semibold">Invite a teammate</h2>
      <form action={action} className="mt-4 grid gap-4 md:grid-cols-[1fr_auto_auto] md:items-end">
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <div className="flex flex-col gap-1.5"><Label htmlFor="invite-email">Email</Label><Input id="invite-email" name="email" type="email" placeholder="name@company.com" required /></div>
        <div className="flex flex-col gap-1.5"><Label htmlFor="invite-role">Role</Label><NativeSelect id="invite-role" name="role" value={role} onChange={(e) => setRole(e.target.value as WorkspaceRole)} className="w-55">{roles.map((r) => (<option key={r} value={r}>{label(r)}</option>))}</NativeSelect></div>
        <Button type="submit" color="primary" loading={pending}>Send invitation</Button>
      </form>
      <p className="mt-3 text-sm text-secondary/70">{ROLE_HELP[role]}</p>
    </section>
  );
}

function MembersTable({ workspaceId, members, roles, canManage, myRole }: { workspaceId: string; members: MemberRow[]; roles: readonly WorkspaceRole[]; canManage: boolean; myRole: WorkspaceRole }) {
  const [state, roleAction] = useActionState<ActionState, FormData>(updateMemberRole, {});
  const { notify, run, pending } = useActionFeedback();
  useEffect(() => notify(state), [state, notify]);
  const editable = (m: MemberRow) => canManage && !m.isYou && (myRole === "owner" || m.role !== "owner");
  return (
    <section aria-labelledby="members-heading">
      <h2 id="members-heading" className="text-base font-semibold">Members <span className="font-normal text-secondary/70">({members.length})</span></h2>
      <Table className="mt-3 w-full">
        <thead><tr><th>Member</th><th>Role</th><th>Grants</th>{canManage && <th className="text-right">Actions</th>}</tr></thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id}>
              <td><span className="flex items-center gap-3"><Avatar size="sm" color="neutral" alt="" src={m.image ?? undefined}>{m.name.slice(0, 2).toUpperCase()}</Avatar><span className="min-w-0"><span className="block truncate font-medium">{m.name} {m.isYou && <Badge size="xs" variant="soft" color="neutral">You</Badge>}</span><span className="block truncate text-sm text-secondary/70">{m.email}</span></span></span></td>
              <td>
                {editable(m) ? (
                  <form action={roleAction} className="flex items-center gap-2"><input type="hidden" name="workspaceId" value={workspaceId} /><input type="hidden" name="membershipId" value={m.id} />
                    <NativeSelect name="role" size="sm" defaultValue={m.role} onChange={(e) => e.currentTarget.form?.requestSubmit()} aria-label={`Role for ${m.name}`}>{roles.map((r) => (<option key={r} value={r}>{label(r)}</option>))}</NativeSelect>
                  </form>
                ) : (<span className="capitalize">{label(m.role)}</span>)}
              </td>
              <td className="text-sm text-secondary/70">{m.grants.length ? m.grants.join(", ") : "—"}</td>
              {canManage && <td className="text-right">{editable(m) && <Button size="sm" variant="ghost" color="error" disabled={pending} onClick={() => run(() => removeMember(workspaceId, m.id))}>Remove</Button>}</td>}
            </tr>
          ))}
        </tbody>
      </Table>
    </section>
  );
}

function InvitationsTable({ workspaceId, invitations, canManage }: { workspaceId: string; invitations: InvitationRow[]; canManage: boolean }) {
  const { run, pending } = useActionFeedback();
  return (
    <section aria-labelledby="pending-heading">
      <h2 id="pending-heading" className="text-base font-semibold">Pending invitations</h2>
      <Table className="mt-3 w-full">
        <thead><tr><th>Email</th><th>Role</th><th>Expires</th>{canManage && <th className="text-right">Actions</th>}</tr></thead>
        <tbody>
          {invitations.map((i) => (
            <tr key={i.id}>
              <td className="font-medium">{i.email}</td><td className="capitalize">{label(i.role)}</td><td className="text-sm text-secondary/70">{new Date(i.expiresAt).toLocaleString()}</td>
              {canManage && <td className="text-right"><Button size="sm" variant="ghost" color="neutral" disabled={pending} onClick={() => run(() => revokeInvitation(workspaceId, i.id))}>Revoke</Button></td>}
            </tr>
          ))}
        </tbody>
      </Table>
    </section>
  );
}
