"use client";

import { Button } from "@wizeworks/silicaui-react";
import { CheckIcon } from "@rocketease/ui/icons";
import { markAllRead } from "@/lib/actions/notifications";
import { useActionFeedback } from "@/lib/use-action-feedback";

export function MarkAllRead({ workspaceId, unread }: { workspaceId: string; unread: number }) {
  const { run, pending } = useActionFeedback();
  return (
    <Button variant="outline" color="neutral" iconStart={<CheckIcon size={14} />} disabled={pending || unread === 0} onClick={() => run(async () => { await markAllRead(workspaceId); return { ok: "All notifications marked read." }; })}>
      Mark all read{unread > 0 ? ` (${unread})` : ""}
    </Button>
  );
}
