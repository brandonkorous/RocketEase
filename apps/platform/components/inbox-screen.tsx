"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { workspacePath } from "@/lib/nav";
import { ContextPanel } from "./inbox/context-panel";
import { InboxDevTools } from "./inbox/dev-tools";
import { InboxQueue } from "./inbox/queue";
import { InboxStatsRow } from "./inbox/stats";
import { ConversationThread } from "./inbox/thread";
import type { InboxScreenData, Nav } from "./inbox/types";

export type { InboxScreenData } from "./inbox/types";

/**
 * Three-pane inbox (queue / thread / context) per images/conversations.png.
 * On small screens the list and the thread are separate routes.
 */
export function InboxScreen({ data }: { data: InboxScreenData }) {
  const router = useRouter();
  const params = useSearchParams();
  const nav: Nav = (patch) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    router.push(`${workspacePath(data.workspaceId, "inbox")}?${next.toString()}`);
  };
  const d = data.detail;
  const threadRemote = d?.remoteThreadId;

  return (
    <div className="mx-auto flex w-full max-w-360 flex-col gap-4 px-4 py-5 lg:px-8">
      <div className={`flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between ${d ? "hidden lg:flex" : ""}`}>
        <div><h1 className="app-title">Inbox</h1><p className="mt-1 text-base text-secondary">Respond to messages, manage customer relationships, and drive results.</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="select select-sm w-auto" value={data.filters.assignee} onChange={(e) => nav({ assignee: e.target.value || null })} aria-label="Assignee filter">
            <option value="">Anyone</option><option value="me">Assigned to me</option><option value="unassigned">Unassigned</option>
            {data.agents.map((a) => (<option key={a.userId} value={a.userId}>{a.name}</option>))}
          </select>
          <Link href={workspacePath(data.workspaceId, "create")} className="btn btn-primary btn-sm">Compose</Link>
        </div>
      </div>
      <div className={d ? "hidden lg:block" : ""}><InboxStatsRow stats={data.stats} /></div>
      <InboxDevTools workspaceId={data.workspaceId} channels={data.devChannels} threadRemoteId={threadRemote} preferredChannelId={d?.channel.id} />
      <div className="grid min-h-150 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,1.8fr)_minmax(0,1fr)]">
        <div className={`min-h-0 ${d ? "hidden lg:block" : ""}`}><InboxQueue data={data} nav={nav} /></div>
        {d ? (
          <>
            <ConversationThread data={data} d={d} />
            <ContextPanel data={data} d={d} />
          </>
        ) : (
          <div className="hidden items-center justify-center rounded-box border border-dashed border-base-300 p-8 text-center text-sm text-secondary/70 lg:flex xl:col-span-2">Select a conversation to read and reply.</div>
        )}
      </div>
    </div>
  );
}
