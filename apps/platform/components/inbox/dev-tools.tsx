"use client";

import { useState } from "react";
import { Button } from "@wizeworks/silicaui-react";
import { simulateInbound, syncInboxNow } from "@/lib/actions/inbox";
import { useActionFeedback } from "@/lib/use-action-feedback";
import type { InboxChannel } from "./types";

/** Local-only helpers for the demo network: simulate a customer message, force a poll. */
export function InboxDevTools({ workspaceId, channels, threadRemoteId, preferredChannelId }: { workspaceId: string; channels: InboxChannel[]; threadRemoteId?: string; preferredChannelId?: string }) {
  const { run, pending } = useActionFeedback();
  const [channelId, setChannelId] = useState(preferredChannelId ?? channels[0]?.id ?? "");
  const [text, setText] = useState("");
  if (channels.length === 0) return null;
  return (
    <details className="rounded-box border border-dashed border-base-300 px-4 py-2 text-xs">
      <summary className="cursor-pointer font-semibold text-secondary">Demo network tools (local only)</summary>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select className="select select-xs w-auto" value={channelId} onChange={(e) => setChannelId(e.target.value)} aria-label="Demo channel">{channels.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}</select>
        <input className="input input-xs w-full max-w-90" value={text} onChange={(e) => setText(e.target.value)} placeholder="Customer message text" aria-label="Simulated message" />
        <Button size="xs" color="primary" loading={pending} onClick={() => run(() => simulateInbound(workspaceId, channelId, { text, kind: "message", threadRemoteId }), () => setText(""))}>{threadRemoteId ? "Customer replies here" : "Simulate new DM"}</Button>
        <Button size="xs" variant="outline" color="neutral" disabled={pending} onClick={() => run(() => simulateInbound(workspaceId, channelId, { text, kind: "comment" }))}>Simulate comment</Button>
        <Button size="xs" variant="outline" color="neutral" disabled={pending} onClick={() => run(() => simulateInbound(workspaceId, channelId, { text, kind: "review", rating: 2 }))}>Simulate 2-star review</Button>
        <Button size="xs" variant="ghost" color="neutral" disabled={pending} onClick={() => run(() => syncInboxNow(workspaceId))}>Poll now</Button>
      </div>
    </details>
  );
}
