"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, Button } from "@wizeworks/silicaui-react";
import { attachContent, detachContent } from "@/lib/actions/campaigns";
import { METRICS, formatMetric } from "@/lib/analytics/metrics";
import type { CampaignDetailData } from "@/lib/campaigns/detail";
import type { ContentRow } from "@/lib/campaigns/tabs";
import { workspacePath } from "@/lib/nav";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { NetMark } from "../net-mark";
import { Empty, Panel } from "./period-bar";

const STATUS_COLOR: Record<string, "neutral" | "success" | "warning" | "error" | "info"> = { published: "success", partially_published: "warning", failed: "error", scheduled: "info", in_review: "info", changes_requested: "warning", approved: "success", canceled: "neutral" };

function AttachForm({ data }: { data: CampaignDetailData }) {
  const { run, pending } = useActionFeedback();
  const [itemId, setItemId] = useState("");
  const items = data.content!.attachable;
  return (
    <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (itemId) run(() => attachContent(data.workspaceId, data.campaign.id, itemId), () => setItemId("")); }}>
      <select className="select select-sm w-auto max-w-80" value={itemId} onChange={(e) => setItemId(e.target.value)} aria-label="Content item to attach">
        <option value="">Attach existing content…</option>
        {items.map((i) => (<option key={i.id} value={i.id}>{i.title} · {i.status.replace("_", " ")}</option>))}
      </select>
      <Button type="submit" size="sm" variant="outline" color="neutral" disabled={!itemId} loading={pending}>Attach</Button>
      <Link href={`${workspacePath(data.workspaceId, "create")}?campaign=${data.campaign.id}`} className="btn btn-primary btn-sm">Create new post</Link>
    </form>
  );
}

function Row({ data, r }: { data: CampaignDetailData; r: ContentRow }) {
  const { run, pending } = useActionFeedback();
  return (
    <tr>
      <td className="py-2"><Link href={workspacePath(data.workspaceId, `posts/${r.id}`)} className="font-medium hover:underline">{r.title}</Link>{r.addedBy && <div className="text-xs text-secondary/70">Added by {r.addedBy}</div>}</td>
      <td className="py-2"><Badge size="xs" variant="soft" color={STATUS_COLOR[r.status] ?? "neutral"}>{r.status.replace("_", " ")}</Badge></td>
      <td className="py-2"><span className="flex items-center gap-1">{r.networks.map((n) => (<NetMark key={n} network={n} size={14} />))}{r.networks.length === 0 && <span className="text-xs text-secondary/70">No channels</span>}</span></td>
      <td className="py-2 text-xs text-secondary">{r.when ?? "—"}</td>
      <td className="py-2 text-right text-sm">{r.reach === null ? <span className="text-secondary/50">—</span> : formatMetric(METRICS.reach, r.reach)}</td>
      <td className="py-2 text-right text-sm font-semibold">{r.engagement === null ? <span className="text-secondary/50">—</span> : formatMetric(METRICS.engagement, r.engagement)}</td>
      <td className="py-2 text-right">{data.canDraft && <Button size="xs" variant="ghost" color="neutral" loading={pending} onClick={() => run(() => detachContent(data.workspaceId, data.campaign.id, r.id))}>Remove</Button>}</td>
    </tr>
  );
}

/** Organic content attached to the campaign (flows.md step 2). Reach/engagement are lifetime post facts. */
export function ContentTab({ data }: { data: CampaignDetailData }) {
  const rows = data.content!.rows;
  return (
    <Panel title={`Content (${rows.length})`} action={data.canDraft && !data.campaign.archived ? <AttachForm data={data} /> : undefined}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-180 text-sm">
          <thead className="text-xs text-secondary"><tr><th className="pb-2 text-left font-medium">Post</th><th className="pb-2 text-left font-medium">Status</th><th className="pb-2 text-left font-medium">Channels</th><th className="pb-2 text-left font-medium">Published / scheduled</th><th className="pb-2 text-right font-medium">Reach</th><th className="pb-2 text-right font-medium">Engagement</th><th /></tr></thead>
          <tbody className="divide-y divide-base-300">
            {rows.map((r) => (<Row key={r.id} data={data} r={r} />))}
            {rows.length === 0 && <tr><td colSpan={7}><Empty>No content attached yet. Attach an existing post or create one for this campaign.</Empty></td></tr>}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
