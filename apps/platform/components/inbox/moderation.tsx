"use client";

import { Button } from "@wizeworks/silicaui-react";
import type { ModerationView } from "@/lib/engagement/moderation/view";
import { clearMessageModeration, flagMessage, hideMessage } from "@/lib/actions/inbox";
import { useActionFeedback } from "@/lib/use-action-feedback";

type Target = { messageId: string; workspaceId: string };

/** What a rule or a person did to this message: glyph + label, then the reason, who and when, and the way back. */
export function ModerationLine({ m, messageId, workspaceId, canHandle }: Target & { m: ModerationView; canHandle: boolean }) {
  const { run, pending } = useActionFeedback();
  const trouble = m.remote === "failed" || m.remote === "unsupported";
  const clear = () => run(() => clearMessageModeration(workspaceId, messageId));
  return (
    <div className={`mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-field px-2 py-1 text-xs ${trouble ? "bg-error/10" : "bg-base-200"}`} role="status">
      <span className="font-semibold"><span aria-hidden="true">{m.glyph}</span> {m.label}</span>
      <span className="text-secondary">{m.detail}</span>
      {canHandle && m.remote === "hidden" && <Button size="xs" variant="ghost" color="neutral" loading={pending} onClick={clear}>Show again</Button>}
      {canHandle && (m.remote === "none" || m.remote === "unsupported") && <Button size="xs" variant="ghost" color="neutral" loading={pending} onClick={clear}>Clear flag</Button>}
      {canHandle && m.remote === "failed" && m.action === "hide" && <Button size="xs" variant="ghost" color="neutral" loading={pending} onClick={() => run(() => hideMessage(workspaceId, messageId, m.reason))}>Try again</Button>}
      {canHandle && m.remote === "failed" && m.action === "unhide" && <Button size="xs" variant="ghost" color="neutral" loading={pending} onClick={clear}>Try again</Button>}
      {canHandle && m.remote === "failed" && <Button size="xs" variant="ghost" color="neutral" loading={pending} onClick={clear}>Clear</Button>}
    </div>
  );
}

/** Hide (refused with the reason where the network cannot) and Flag, on an inbound message nobody has touched. */
export function ModerateButtons({ messageId, workspaceId }: Target) {
  const { run, pending } = useActionFeedback();
  return (
    <>
      <Button size="xs" variant="ghost" color="neutral" loading={pending} onClick={() => run(() => hideMessage(workspaceId, messageId))}>Hide</Button>
      <Button size="xs" variant="ghost" color="neutral" disabled={pending} onClick={() => run(() => flagMessage(workspaceId, messageId))}>Flag</Button>
    </>
  );
}
