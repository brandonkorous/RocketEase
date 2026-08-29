"use client";

import { Fragment } from "react";
import { Avatar, Button } from "@wizeworks/silicaui-react";
import type { ConversationDetailData, MessageRow } from "@/lib/engagement/detail";
import { retryReply, sendDraftReply } from "@/lib/actions/inbox";
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

/** Review rating: stars AND a number, never colour alone (design.md status rule). */
function Rating({ value }: { value: number }) {
  const stars = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold">
      <span aria-hidden="true">{"★".repeat(stars)}{"☆".repeat(5 - stars)}</span>
      <span aria-hidden="true">{stars}/5</span>
      <span className="sr-only">Rated {stars} out of 5</span>
    </p>
  );
}

function Bubble({ m, d, workspaceId }: { m: MessageRow; d: ConversationDetailData; workspaceId: string }) {
  const { run, pending } = useActionFeedback();
  const out = m.direction === "outbound";
  return (
    <li className={`flex items-end gap-2 ${out ? "flex-row-reverse" : ""}`}>
      <Avatar size="xs" color="neutral" alt="" src={out ? undefined : (d.contact.avatarUrl ?? undefined)}>{(out ? (m.by ?? "You") : d.contact.name).slice(0, 2).toUpperCase()}</Avatar>
      <div className={`max-w-5/6 rounded-box px-4 py-3 ${out ? "bg-base-200" : "border border-base-300"}`}>
        {m.rating != null && <Rating value={m.rating} />}
        {m.body ? <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.body}</p> : m.rating != null && <p className="text-sm italic text-secondary/70">No comment left with this rating.</p>}
        {m.attachments.map((a) => (<Attachment key={a.url} a={a} />))}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-secondary/70">
          <span>{m.at}</span>
          {out && <span>· Sent by {m.by ?? "you"}</span>}
          {out && m.state !== "sent" && <span className={m.state === "failed" ? "font-medium text-error" : ""}>· {DELIVERY_LABEL[m.state] ?? m.state}{m.state === "failed" && m.error ? ` — ${m.error}` : ""}</span>}
          {out && m.state === "sent" && <span className="text-success" aria-label="Delivered">✓✓</span>}
          {out && m.state === "failed" && <Button size="xs" variant="ghost" color="neutral" loading={pending} onClick={() => run(() => retryReply(workspaceId, m.id))}>Retry</Button>}
          {out && m.state === "draft" && <Button size="xs" variant="outline" color="neutral" loading={pending} onClick={() => run(() => sendDraftReply(workspaceId, m.id))}>Send</Button>}
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
