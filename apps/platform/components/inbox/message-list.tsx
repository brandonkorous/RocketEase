"use client";

import { Fragment } from "react";
import { Avatar, Button } from "@wizeworks/silicaui-react";
import type { ConversationDetailData, MessageRow } from "@/lib/engagement/detail";
import { retryReply } from "@/lib/actions/inbox";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { DELIVERY_LABEL } from "./types";

function Attachment({ a }: { a: MessageRow["attachments"][number] }) {
  const size = a.sizeBytes ? ` • ${(a.sizeBytes / 1_048_576).toFixed(1)} MB` : "";
  return (
    <a href={a.url} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-2 rounded-field border border-base-300 bg-base-100 px-3 py-2 text-sm hover:bg-base-200">
      <span className="rounded bg-base-200 px-1.5 text-xs font-semibold uppercase">{a.mimeType.split("/")[1]?.slice(0, 4) ?? "file"}</span>
      <span className="min-w-0 flex-1 truncate">{a.name ?? a.url}</span>
      <span className="text-xs text-secondary/70">{size}</span>
    </a>
  );
}

function Bubble({ m, d, workspaceId }: { m: MessageRow; d: ConversationDetailData; workspaceId: string }) {
  const { run, pending } = useActionFeedback();
  const out = m.direction === "outbound";
  return (
    <li className={`flex items-end gap-2 ${out ? "flex-row-reverse" : ""}`}>
      <Avatar size="xs" color="neutral" alt="" src={out ? undefined : (d.contact.avatarUrl ?? undefined)}>{(out ? (m.by ?? "You") : d.contact.name).slice(0, 2).toUpperCase()}</Avatar>
      <div className={`max-w-5/6 rounded-box px-4 py-3 ${out ? "bg-base-200" : "border border-base-300"}`}>
        {m.rating != null && <div className="mb-1 text-xs font-semibold text-warning">{"★".repeat(m.rating)}{"☆".repeat(5 - m.rating)}</div>}
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.body}</p>
        {m.attachments.map((a) => (<Attachment key={a.url} a={a} />))}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-secondary/70">
          <span>{m.at}</span>
          {out && <span>· Sent by {m.by ?? "you"}</span>}
          {out && m.state !== "sent" && <span className={m.state === "failed" ? "font-medium text-error" : ""}>· {DELIVERY_LABEL[m.state] ?? m.state}{m.state === "failed" && m.error ? ` — ${m.error}` : ""}</span>}
          {out && m.state === "sent" && <span className="text-success" aria-label="Delivered">✓✓</span>}
          {out && m.state === "failed" && <Button size="xs" variant="ghost" color="neutral" loading={pending} onClick={() => run(() => retryReply(workspaceId, m.id))}>Retry</Button>}
        </div>
      </div>
    </li>
  );
}

export function MessageList({ d, workspaceId }: { d: ConversationDetailData; workspaceId: string }) {
  let lastDay = "";
  return (
    <ol className="flex flex-col gap-3 px-4 py-4">
      {d.messages.map((m) => {
        const divider = m.dayKey !== lastDay ? m.dayKey : null;
        lastDay = m.dayKey;
        return (
          <Fragment key={m.id}>
            {divider && <li className="my-1 flex items-center gap-3 text-xs text-secondary/70" aria-hidden="true"><span className="h-px flex-1 bg-base-300" />{divider}<span className="h-px flex-1 bg-base-300" /></li>}
            <Bubble m={m} d={d} workspaceId={workspaceId} />
          </Fragment>
        );
      })}
      {d.messages.length === 0 && <li className="text-center text-sm text-secondary/70">No messages yet.</li>}
    </ol>
  );
}
