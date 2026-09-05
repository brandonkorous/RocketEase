"use client";

import { useState } from "react";
import { Badge, Button, Input } from "@wizeworks/silicaui-react";
import { setRequestDue } from "@/lib/actions/approvals";
import { utcToZonedInput } from "@/lib/time";
import { useActionFeedback } from "@/lib/use-action-feedback";
import type { ApprovalDetailData, ApprovalsData } from "./types";

function ClockIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

/** Icon + label, never colour alone: a request past its due time and still waiting. */
export function OverdueBadge() {
  return (
    <Badge size="xs" variant="soft" color="error">
      <ClockIcon />
      <span className="ml-1">Overdue</span>
    </Badge>
  );
}

/** The due time on the detail pane, with the change control for reviewers and the requester. */
export function DueDateCard({ d, data }: { d: ApprovalDetailData; data: ApprovalsData }) {
  const { run, pending } = useActionFeedback();
  const current = d.dueAt ? utcToZonedInput(new Date(d.dueAt), data.timezone) : "";
  const [value, setValue] = useState(current);
  return (
    <div className="rounded-xl border border-base-300 p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Due</h3>
        {d.overdue && <OverdueBadge />}
      </div>
      <p className={`mt-2 text-sm ${d.overdue ? "font-medium text-error" : ""}`}>{d.dueLabel ?? "No due time"}</p>
      {d.canSetDue && (
        <form className="mt-2 flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); run(() => setRequestDue({ workspaceId: data.workspaceId, requestId: d.id, dueAt: value })); }}>
          <Input type="datetime-local" size="sm" value={value} onChange={(e) => setValue(e.target.value)} aria-label="New due time" />
          <Button type="submit" size="sm" variant="outline" color="neutral" loading={pending} disabled={!value || value === current}>Change due time</Button>
        </form>
      )}
    </div>
  );
}
