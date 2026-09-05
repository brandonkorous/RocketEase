"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@wizeworks/silicaui-react";
import { buttonClasses } from "@wizeworks/silicaui-react/server";
import { NetMark } from "@/components/net-mark";
import { rescheduleItem } from "@/lib/actions/content";
import type { GridData } from "@/lib/grid/types";
import { workspacePath } from "@/lib/nav";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { CoverPicker } from "./cover-picker";
import { FORMAT_WORD, NETWORK_LABEL, STATE_WORD, longDay, stateLabel, time12 } from "./format";
import { GridIcon } from "./icons";

/** The selected tile: what it is, when it lands, its cover, and the keyboard path to move it. */
export function SelectedPanel({ data, onClose }: { data: GridData; onClose: () => void }) {
  const sel = data.selected!;
  const { post } = sel;
  const pill = stateLabel(post);
  return (
    <section className="rounded-box border border-base-300 p-4" aria-labelledby="sel-h">
      <div className="flex items-center justify-between">
        <h2 id="sel-h" className="text-sm font-semibold">Selected tile</h2>
        <button type="button" onClick={onClose} className="flex text-secondary hover:text-base-content" aria-label="Close">{GridIcon.close}</button>
      </div>
      <div className="mt-3 flex gap-3">
        <span className="h-24 w-18 shrink-0 overflow-hidden rounded-field bg-base-200">{post.thumbUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={post.thumbUrl} alt="" className="h-full w-full object-cover" />}</span>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="truncate text-sm font-semibold">{post.title}</div>
          <div className="text-xs text-secondary">{FORMAT_WORD[post.format] ?? post.format}{post.text ? ` · ${post.text.slice(0, 60)}${post.text.length > 60 ? "…" : ""}` : ""}</div>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-secondary">{pill ? GridIcon[pill.icon] : null}<span>{STATE_WORD[post.state]}{post.localDay ? ` · ${longDay(post.localDay)}${post.localTime ? ` · ${time12(post.localTime)}` : ""}` : ""}</span></div>
          <div className="flex items-center gap-1.5 text-xs text-secondary"><NetMark network={data.channel.network} size={12} /><span>{data.channel.handle ?? data.channel.name}</span></div>
          {post.remoteUrl && <a href={post.remoteUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-medium hover:underline">View on {NETWORK_LABEL[data.channel.network]} {GridIcon.external}</a>}
        </div>
      </div>
      <div className="my-3.5 border-t border-base-300" />
      <CoverPicker workspaceId={data.workspaceId} selected={sel} network={data.channel.network} canEdit={data.canCreate} />
      {post.isVideo && <div className="my-3.5 border-t border-base-300" />}
      <div className="flex flex-wrap gap-2">
        <Link href={workspacePath(data.workspaceId, `posts/${post.itemId}`)} className={buttonClasses({ color: "primary", size: "sm" })}>Open post</Link>
        {post.state === "scheduled" && data.canPublish && <MoveControl workspaceId={data.workspaceId} itemId={post.itemId} day={post.localDay!} time={post.localTime ?? "09:00"} />}
      </div>
      <p className="mt-2.5 text-xs leading-relaxed text-secondary">
        {post.state === "live" ? "Live tiles do not move. The network owns their place." : post.state === "scheduled" ? "Drag this tile onto another scheduled tile to swap dates, or onto a gap to move it. Move… does the same by keyboard." : "Schedule this post to place it; drafts and posts in review show where they are planned."}
      </p>
    </section>
  );
}

/** Keyboard path for the drag: pick a new local date and time. Same action as the Calendar's drag. */
function MoveControl({ workspaceId, itemId, day, time }: { workspaceId: string; itemId: string; day: string; time: string }) {
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState(`${day}T${time}`);
  const { run, pending } = useActionFeedback();
  if (!open) return <Button size="sm" variant="outline" color="neutral" onClick={() => setOpen(true)}>Move…</Button>;
  return (
    <form className="flex w-full flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); run(() => rescheduleItem(workspaceId, itemId, when), () => setOpen(false)); }}>
      <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="input input-sm" aria-label="New date and time" required />
      <Button size="sm" color="primary" type="submit" loading={pending}>Move</Button>
      <Button size="sm" variant="ghost" color="neutral" type="button" onClick={() => setOpen(false)}>Keep</Button>
    </form>
  );
}
