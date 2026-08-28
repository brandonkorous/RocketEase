"use client";

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { Avatar, Button, Input } from "@wizeworks/silicaui-react";
import { buttonClasses } from "@wizeworks/silicaui-react/server";
import { UsersIcon } from "../shell/icons";
import { inviteMember, type ActionState } from "@/lib/actions/team";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { StepIntro } from "./frame";

export type Invitee = { id: string; email: string; role: string; name?: string | null };
const ROLES = [["admin", "Admin"], ["manager", "Manager"], ["creator", "Creator"], ["responder", "Responder"], ["analyst", "Analyst"], ["client_approver", "Client approver"], ["viewer", "Viewer"]] as const;

/** Step 3: invite teammates; each Add sends a real invitation email. */
export function InviteStep({ workspaceId, invitees, nextHref }: { workspaceId: string; invitees: Invitee[]; nextHref: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(inviteMember, {});
  const { notify, router } = useActionFeedback();
  useEffect(() => { if (state.ok || state.error) { notify(state); if (state.ok) router.refresh(); } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <div>
      <StepIntro icon={<UsersIcon />} title="Invite your team" copy="Add teammates to collaborate and manage social together." />
      <form action={action} className="flex flex-col gap-2">
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <label className="text-xs font-medium text-secondary" htmlFor="invite-email">Email address</label>
        <div className="flex gap-2">
          <Input id="invite-email" name="email" type="email" placeholder="name@company.com" className="flex-1" required />
          <select name="role" className="select select-sm w-auto" defaultValue="creator" aria-label="Role">{ROLES.map(([k, l]) => (<option key={k} value={k}>{l}</option>))}</select>
          <Button type="submit" color="primary" size="sm" loading={pending}>Add</Button>
        </div>
      </form>
      <h2 className="mt-5 text-xs font-medium text-secondary">People you&apos;ve invited</h2>
      <ul className="mt-2 flex flex-col divide-y divide-base-300">
        {invitees.map((i) => (
          <li key={i.id} className="flex items-center gap-3 py-2">
            <Avatar size="sm" color="neutral" alt="">{(i.name ?? i.email).slice(0, 2).toUpperCase()}</Avatar>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{i.name ?? i.email.split("@")[0]}</span><span className="block truncate text-xs text-secondary">{i.email}</span></span>
            <span className="text-xs capitalize text-secondary">{i.role.replace("_", " ")}</span>
          </li>
        ))}
        {invitees.length === 0 && <li className="py-3 text-center text-xs text-secondary/70">No invitations yet. You can also do this later from Team.</li>}
      </ul>
      <div className="mt-6 flex flex-col items-center gap-2">
        <Link href={nextHref} className={`${buttonClasses({ color: "primary", size: "lg" })} w-full`}>Continue</Link>
      </div>
    </div>
  );
}
