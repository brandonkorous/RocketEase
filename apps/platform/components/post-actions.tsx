"use client";

import { useState } from "react";
import { Button, Input } from "@wizeworks/silicaui-react";
import { cancelSchedule, deleteDraft, duplicateItem, rescheduleItem, retryFailed } from "@/lib/actions/content";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { workspacePath } from "@/lib/nav";

type Props = { workspaceId: string; itemId: string; canPublish: boolean; hasFailed: boolean; hasScheduled: boolean; scheduledLocal: string | null; timezone: string; isDraft: boolean };

export function PostActions({ workspaceId, itemId, canPublish, hasFailed, hasScheduled, scheduledLocal, timezone, isDraft }: Props) {
  const { run, pending, router, notify } = useActionFeedback();
  const [resched, setResched] = useState(false);
  const [when, setWhen] = useState(scheduledLocal ?? "");

  const onDuplicate = () => run(async () => { const r = await duplicateItem(workspaceId, itemId); if ("itemId" in r) router.push(workspacePath(workspaceId, `create?item=${r.itemId}`)); return "itemId" in r ? { ok: "Duplicated." } : r; });
  const onDelete = () => { if (confirm("Delete this draft?")) run(() => deleteDraft(workspaceId, itemId), (r) => { if (r.ok) router.push(workspacePath(workspaceId, "calendar")); }); };
  void notify;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canPublish && hasFailed && <Button color="primary" loading={pending} onClick={() => run(() => retryFailed(workspaceId, itemId))}>Retry failed</Button>}
      {canPublish && hasScheduled && !resched && <Button variant="outline" color="neutral" disabled={pending} onClick={() => setResched(true)}>Reschedule</Button>}
      {resched && (
        <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); setResched(false); run(() => rescheduleItem(workspaceId, itemId, when)); }}>
          <Input type="datetime-local" size="sm" value={when} onChange={(e) => setWhen(e.target.value)} aria-label={`New time (${timezone})`} required />
          <Button type="submit" size="sm" color="primary" loading={pending}>Move</Button>
          <Button type="button" size="sm" variant="ghost" color="neutral" onClick={() => setResched(false)}>Cancel</Button>
        </form>
      )}
      {canPublish && hasScheduled && <Button variant="ghost" color="neutral" disabled={pending} onClick={() => run(() => cancelSchedule(workspaceId, itemId))}>Unschedule</Button>}
      <Button variant="ghost" color="neutral" disabled={pending} onClick={onDuplicate}>Duplicate</Button>
      {isDraft && <Button variant="ghost" color="error" disabled={pending} onClick={onDelete}>Delete</Button>}
    </div>
  );
}
