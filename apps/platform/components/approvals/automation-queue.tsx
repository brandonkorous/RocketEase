"use client";

import { useState } from "react";
import { Badge, Button, Input } from "@wizeworks/silicaui-react";
import { decideAutomationApproval } from "@/lib/actions/automations/approvals";
import type { AutomationApprovalRow } from "@/lib/automations/queries";
import { useActionFeedback } from "@/lib/use-action-feedback";

type Decide = (id: string, decision: "approved" | "rejected", comment?: string) => void;

function RejectForm({ pending, onSubmit, onCancel }: { pending: boolean; onSubmit: (reason: string) => void; onCancel: () => void }) {
  const [reason, setReason] = useState("");
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(reason);
      }}
    >
      <Input size="sm" className="max-w-100 flex-1" maxLength={1000} required value={reason} placeholder="Why are you rejecting it?" onChange={(e) => setReason(e.target.value)} />
      <Button type="submit" size="xs" color="error" loading={pending} disabled={!reason.trim()}>Reject</Button>
      <Button type="button" size="xs" variant="ghost" color="neutral" onClick={onCancel}>Cancel</Button>
    </form>
  );
}

function GateRow({ r, pending, decide }: { r: AutomationApprovalRow; pending: boolean; decide: Decide }) {
  const [rejecting, setRejecting] = useState(false);
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-start gap-2">
        <Badge size="xs" variant="soft" color="neutral">Automation</Badge>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{r.ruleName}</span>
          <span className="block text-sm text-secondary">{r.summary}</span>
          {r.explanation && <span className="block text-xs text-secondary/70">{r.explanation}</span>}
          <span className={`block text-xs ${r.overdue ? "font-medium text-error" : "text-secondary/70"}`}>
            Requested {r.requestedAt}
            {r.dueLabel ? ` · due ${r.dueLabel}${r.overdue ? " · overdue" : ""}` : ""}
          </span>
        </span>
        {r.canDecide ? (
          <span className="flex shrink-0 gap-1">
            <Button size="xs" color="primary" loading={pending} onClick={() => decide(r.id, "approved")}>Approve</Button>
            <Button size="xs" variant="outline" color="neutral" disabled={pending} onClick={() => setRejecting(!rejecting)}>Reject</Button>
          </span>
        ) : (
          <span className="shrink-0 text-xs text-secondary/70">Your role can&apos;t decide this.</span>
        )}
      </div>
      {rejecting && <RejectForm pending={pending} onSubmit={(reason) => decide(r.id, "rejected", reason)} onCancel={() => setRejecting(false)} />}
    </li>
  );
}

/**
 * Automation gates sit above the content queue with their own badge: they are
 * not content approvals, and approving one resumes a parked run rather than
 * publishing a post.
 */
export function AutomationQueue({ workspaceId, rows }: { workspaceId: string; rows: AutomationApprovalRow[] }) {
  const { run, pending } = useActionFeedback();
  if (rows.length === 0) return null;
  const decide: Decide = (id, decision, comment) => run(() => decideAutomationApproval(workspaceId, id, decision, comment));
  return (
    <section className="rounded-box border border-base-300" aria-label="Automation approvals">
      <h2 className="border-b border-base-300 px-4 py-3 text-sm font-semibold">
        Automations waiting on you
        <span className="ml-2 rounded-full bg-base-200 px-1.5 text-xs font-normal">{rows.length}</span>
      </h2>
      <ul className="divide-y divide-base-300">
        {rows.map((r) => (
          <GateRow key={r.id} r={r} pending={pending} decide={decide} />
        ))}
      </ul>
    </section>
  );
}
