"use client";

import Link from "next/link";
import { Badge } from "@wizeworks/silicaui-react";
import { METRICS, formatMetric } from "@/lib/analytics/metrics";
import type { CampaignDetailData } from "@/lib/campaigns/detail";
import { workspacePath } from "@/lib/nav";
import { NetMark } from "../net-mark";
import type { TabNav } from "./detail-screen";
import { eventLine } from "./overview-tab";
import { Empty, Panel, PeriodBar } from "./period-bar";

/** Audience: only what providers give (reach per network, imported targeting); everything else says why it is unavailable. */
export function AudienceTab({ data, nav }: { data: CampaignDetailData; nav: TabNav }) {
  const a = data.audience!;
  const total = a.reachByNetwork.reduce((s, r) => s + r.value, 0);
  return (
    <>
      <PeriodBar filters={data.filters} periodLabel={data.periodLabel} compareLabel={null} nav={nav} />
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Panel title="Reach by network">
          {a.reachByNetwork.length === 0 && <Empty>No reach facts for this campaign in the period.</Empty>}
          <ul className="flex flex-col gap-1.5 text-sm">{a.reachByNetwork.map((r) => (<li key={r.network} className="flex items-center gap-2"><NetMark network={r.network} size={14} /><span className="flex-1 capitalize">{r.network}</span><span className="font-semibold">{formatMetric(METRICS.reach, r.value)}</span><span className="text-xs text-secondary/70">({total ? ((r.value / total) * 100).toFixed(1) : "0.0"}%)</span></li>))}</ul>
          <p className="mt-2 text-xs text-secondary/70">{METRICS.reach.caveat}</p>
        </Panel>
        <Panel title="Paid targeting (imported)">
          {a.targeting.length === 0 && <Empty>No ad set targeting imported for linked ad campaigns.</Empty>}
          <ul className="divide-y divide-base-300 text-sm">{a.targeting.map((t, i) => (<li key={i} className="py-2"><div className="font-medium">{t.adCampaign}</div><div className="text-xs text-secondary">{t.summary}</div></li>))}</ul>
        </Panel>
        <Panel title="Demographics & locations">
          <ul className="flex flex-col gap-2 text-sm">{a.unavailable.map((u) => (<li key={u.channel} className="flex items-start gap-2"><NetMark network={u.network} size={14} /><span><span className="font-medium">{u.channel}</span><span className="block text-xs text-secondary">Unavailable · {u.reason}</span></span></li>))}{a.unavailable.length === 0 && <Empty>No connected channels.</Empty>}</ul>
        </Panel>
      </div>
    </>
  );
}

const KIND_LABEL: Record<string, string> = { comment: "Comment", mention: "Mention", message: "Message", review: "Review" };

/** Inbox threads on this campaign's posts (post_remote_id joins the campaign's remote publications). */
export function ConversationsTab({ data }: { data: CampaignDetailData }) {
  const rows = data.conversations!;
  return (
    <Panel title={`Conversations (${rows.length})`} action={<Link href={workspacePath(data.workspaceId, "inbox")} className="text-xs font-medium hover:underline">Open inbox →</Link>}>
      {rows.length === 0 && <Empty>No comments, mentions or messages on this campaign's published posts yet.</Empty>}
      <ul className="divide-y divide-base-300 text-sm">
        {rows.map((r) => (<li key={r.id}><Link href={workspacePath(data.workspaceId, `inbox/${r.id}`)} className="flex items-start gap-3 py-2 hover:bg-base-200/50"><NetMark network={r.channel.network} size={16} /><span className="min-w-0 flex-1"><span className="block font-medium">{r.contact} <span className="text-xs font-normal text-secondary">· {KIND_LABEL[r.kind] ?? r.kind} · {r.channel.name}</span></span><span className="block truncate text-secondary">{r.preview || "(no text)"}</span></span><span className="flex shrink-0 flex-col items-end gap-1"><span className="text-xs text-secondary/70">{r.lastAt}</span><Badge size="xs" variant="soft" color={r.status === "open" ? "warning" : r.status === "resolved" ? "success" : "neutral"}>{r.status}</Badge></span></Link></li>))}
      </ul>
    </Panel>
  );
}

export function ActivityTab({ data }: { data: CampaignDetailData }) {
  const rows = data.activity!;
  return (
    <Panel title="Activity">
      {rows.length === 0 && <Empty>No activity yet.</Empty>}
      <ol className="divide-y divide-base-300 text-sm">{rows.map((e) => (<li key={e.id} className="py-2"><div>{eventLine(e)}</div><div className="text-xs text-secondary/70">{e.at}{typeof e.data.reason === "string" ? ` · ${e.data.reason}` : ""}{Array.isArray(e.data.fields) && e.data.fields.length ? ` · ${(e.data.fields as string[]).join(", ")}` : ""}</div></li>))}</ol>
      <p className="mt-2 text-xs text-secondary/70">Spend-changing actions are also recorded in the workspace audit log.</p>
    </Panel>
  );
}
