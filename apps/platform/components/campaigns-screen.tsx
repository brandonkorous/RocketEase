"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, Button } from "@wizeworks/silicaui-react";
import { archiveCampaign } from "@/lib/actions/campaigns";
import { METRICS, formatMetric } from "@/lib/analytics/metrics";
import type { CampaignsListData } from "@/lib/campaigns/detail";
import { OBJECTIVE_LABEL, STATUS_COLOR, STATUS_LABEL, formatMoney } from "@/lib/campaigns/format";
import type { CampaignListRow } from "@/lib/campaigns/queries";
import { workspacePath } from "@/lib/nav";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { CampaignForm } from "./campaigns/campaign-form";
import { NetMark } from "./net-mark";

function Row({ r, workspaceId, canManage }: { r: CampaignListRow; workspaceId: string; canManage: boolean }) {
  const { run, pending } = useActionFeedback();
  return (
    <tr>
      <td className="py-2"><Link href={workspacePath(workspaceId, `campaigns/${r.id}`)} className="font-medium hover:underline">{r.name}</Link>{r.alerts.length > 0 && <div className="mt-0.5 flex flex-wrap gap-1">{r.alerts.map((a) => (<span key={a} className="rounded-field bg-warning/10 px-1.5 text-xs text-warning">! {a}</span>))}</div>}</td>
      <td className="py-2 text-sm">{OBJECTIVE_LABEL[r.objective]}</td>
      <td className="py-2"><Badge size="xs" variant="soft" color={STATUS_COLOR[r.status]}>{STATUS_LABEL[r.status]}</Badge></td>
      <td className="py-2 text-xs text-secondary">{r.start && r.end ? `${r.start} – ${r.end}` : r.start ? `From ${r.start}` : r.end ? `Until ${r.end}` : "—"}</td>
      <td className="py-2 text-xs text-secondary">{r.owner ?? "—"}</td>
      <td className="py-2"><span className="flex items-center gap-1">{r.networks.map((n) => (<NetMark key={n} network={n} size={14} />))}{r.networks.length === 0 && <span className="text-xs text-secondary/70">{r.contentCount ? `${r.contentCount} item${r.contentCount > 1 ? "s" : ""}` : "—"}</span>}</span></td>
      <td className="py-2 text-right text-sm font-semibold">{r.spend === null ? <span className="text-secondary/50" title="No linked ad campaign">—</span> : formatMoney(r.spend, r.currency, { compact: true })}</td>
      <td className="py-2 text-right text-sm">{r.conversions !== null ? `${formatMetric(METRICS.conversions, r.conversions)} conv.` : r.engagement !== null ? `${formatMetric(METRICS.engagement, r.engagement)} eng.` : <span className="text-secondary/50">—</span>}</td>
      <td className="py-2 text-right">{canManage && <Button size="xs" variant="ghost" color="neutral" loading={pending} onClick={() => run(() => archiveCampaign(workspaceId, r.id, r.archived))}>{r.archived ? "Restore" : "Archive"}</Button>}</td>
    </tr>
  );
}

/** Campaign list per pages.md: objective, status, dates, owner, channels, spend, outcomes, alerts. */
export function CampaignsScreen({ data }: { data: CampaignsListData }) {
  const [creating, setCreating] = useState(false);
  const base = workspacePath(data.workspaceId, "campaigns");
  return (
    <div className="mx-auto flex w-full max-w-360 flex-col gap-4 px-4 py-5 lg:px-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div><h1 className="app-title">Campaigns</h1><p className="mt-1 text-base text-secondary">Organic content, paid promotion, audience, spend, and outcomes in one container.</p></div>
        <div className="flex gap-2">
          <Link href={data.archived ? base : `${base}?archived=1`} className="btn btn-outline btn-sm">{data.archived ? "Show active" : "Show archived"}</Link>
          {data.canDraft && !creating && <Button size="sm" color="primary" onClick={() => setCreating(true)}>New campaign</Button>}
        </div>
      </div>
      {creating && (
        <section className="rounded-box border border-base-300 p-4" aria-label="New campaign">
          <h2 className="text-sm font-semibold">New campaign</h2>
          <div className="mt-3"><CampaignForm workspaceId={data.workspaceId} initial={{}} members={data.members} defaultOwnerId={data.userId} onDone={() => setCreating(false)} /></div>
        </section>
      )}
      <section className="rounded-box border border-base-300 p-4" aria-label="Campaign list">
        <div className="overflow-x-auto">
          <table className="w-full min-w-200 text-sm">
            <thead className="text-xs text-secondary"><tr><th className="pb-2 text-left font-medium">Campaign</th><th className="pb-2 text-left font-medium">Objective</th><th className="pb-2 text-left font-medium">Status</th><th className="pb-2 text-left font-medium">Dates</th><th className="pb-2 text-left font-medium">Owner</th><th className="pb-2 text-left font-medium">Channels</th><th className="pb-2 text-right font-medium">Spend</th><th className="pb-2 text-right font-medium">Outcomes</th><th /></tr></thead>
            <tbody className="divide-y divide-base-300">
              {data.rows.map((r) => (<Row key={r.id} r={r} workspaceId={data.workspaceId} canManage={data.canManage} />))}
              {data.rows.length === 0 && (
                <tr><td colSpan={9} className="py-10 text-center text-sm text-secondary">
                  {data.archived ? "No archived campaigns." : <>No campaigns yet. A campaign groups posts and ads around one goal so you can compare organic and paid results without rebuilding anything in another tool.{data.canDraft && <> <button type="button" className="font-medium hover:underline" onClick={() => setCreating(true)}>Create the first one</button>.</>}</>}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-secondary/70">Spend and conversions are imported from linked ad campaigns in the ad account's currency. Outcomes show conversions when paid results exist, otherwise organic engagement.</p>
      </section>
    </div>
  );
}
