"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Badge, Button } from "@wizeworks/silicaui-react";
import { archiveCampaign, setCampaignStatus } from "@/lib/actions/campaigns";
import { filtersToQuery } from "@/lib/analytics/periods";
import type { CampaignDetailData } from "@/lib/campaigns/detail";
import { CAMPAIGN_TABS, type CampaignTab } from "@/lib/campaigns/format";
import { OBJECTIVE_LABEL, STATUS_COLOR, STATUS_LABEL } from "@/lib/campaigns/format";
import { workspacePath } from "@/lib/nav";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { NetMark } from "../net-mark";
import { AdsTab } from "./ads-tab";
import { CampaignForm } from "./campaign-form";
import { ClocksStrip } from "./clocks-strip";
import { ContentTab } from "./content-tab";
import { OverviewTab } from "./overview-tab";
import { PerformanceTab } from "./performance-tab";
import { ActivityTab, AudienceTab, ConversationsTab } from "./side-tabs";

export type TabNav = (patch: Record<string, string | null>) => void;

function HeaderActions({ data, onEdit }: { data: CampaignDetailData; onEdit: () => void }) {
  const { run, pending } = useActionFeedback();
  const c = data.campaign;
  if (!data.canManage) return null;
  const next = c.status === "active" ? { to: "paused", label: "Pause campaign" } : c.status === "completed" ? null : { to: "active", label: c.status === "paused" ? "Resume campaign" : "Activate campaign" };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {c.archived ? (
        <Button size="sm" variant="outline" color="neutral" loading={pending} onClick={() => run(() => archiveCampaign(data.workspaceId, c.id, true))}>Restore</Button>
      ) : (
        <>
          {next && <Button size="sm" variant="outline" color="neutral" loading={pending} onClick={() => run(() => setCampaignStatus(data.workspaceId, c.id, next.to))}>{next.label}</Button>}
          {c.status === "active" && <Button size="sm" variant="ghost" color="neutral" loading={pending} onClick={() => run(() => setCampaignStatus(data.workspaceId, c.id, "completed"))}>Mark completed</Button>}
          <Button size="sm" variant="ghost" color="neutral" loading={pending} onClick={() => { if (window.confirm(`Archive "${c.name}"? Nothing is deleted.`)) run(() => archiveCampaign(data.workspaceId, c.id)); }}>Archive</Button>
        </>
      )}
      <Button size="sm" color="primary" onClick={onEdit}>Edit campaign</Button>
    </div>
  );
}

/** Campaign detail per images/campaign-details.png: breadcrumb, title row, dates, description, tab strip, tab body. */
export function CampaignDetailScreen({ data }: { data: CampaignDetailData }) {
  const router = useRouter();
  const params = useSearchParams();
  const [editing, setEditing] = useState(false);
  const c = data.campaign;
  const base = workspacePath(data.workspaceId, `campaigns/${c.id}`);
  const nav: TabNav = (patch) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    router.push(`${base}?${next.toString()}`);
  };
  const tabHref = (tab: CampaignTab) => `${base}?tab=${tab}&${filtersToQuery(data.filters)}`;
  return (
    <div className="mx-auto flex w-full max-w-360 flex-col gap-4 px-4 py-5 lg:px-8">
      <nav className="text-xs text-secondary" aria-label="Breadcrumb"><Link href={workspacePath(data.workspaceId, "campaigns")} className="hover:underline">Campaigns</Link> <span aria-hidden="true">›</span> <span className="text-base-content">{c.name}</span></nav>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="app-title">{c.name}</h1>
            <Badge size="sm" variant="soft" color={c.archived ? "neutral" : STATUS_COLOR[c.status]}>{c.archived ? "Archived" : STATUS_LABEL[c.status]}</Badge>
            <span className="flex items-center gap-1" aria-label="Channels">{data.networks.map((n) => (<NetMark key={n} network={n} size={18} />))}</span>
          </div>
          <p className="mt-1 text-sm text-secondary">{c.range} · {OBJECTIVE_LABEL[c.objective]}{c.owner ? ` · Owner ${c.owner.name}` : ""}</p>
          {c.description && <p className="mt-2 max-w-3xl text-sm">{c.description}</p>}
        </div>
        <HeaderActions data={data} onEdit={() => setEditing((e) => !e)} />
      </div>
      {editing && (
        <section className="rounded-box border border-base-300 p-4" aria-label="Edit campaign">
          <h2 className="text-sm font-semibold">Edit campaign</h2>
          <div className="mt-3"><CampaignForm workspaceId={data.workspaceId} initial={{ id: c.id, name: c.name, description: c.description, objective: c.objective, startAt: c.startLocal, endAt: c.endLocal, ownerUserId: c.owner?.id ?? "", budgetAmount: c.budgetAmount === null ? "" : String(c.budgetAmount), currency: c.currency, tracking: c.tracking, tags: c.tags }} members={data.members} onDone={() => setEditing(false)} /></div>
        </section>
      )}
      <div className="border-b border-base-300">
        <div className="flex gap-5 overflow-x-auto" role="tablist">
          {CAMPAIGN_TABS.map((t) => (<Link key={t.key} href={tabHref(t.key)} role="tab" aria-selected={data.tab === t.key} className={`whitespace-nowrap border-b-2 py-2 text-sm ${data.tab === t.key ? "border-base-content font-semibold" : "border-transparent text-secondary hover:text-base-content"}`}>{t.label}</Link>))}
        </div>
      </div>
      <ClocksStrip clocks={data.clocks} />
      {data.tab === "overview" && <OverviewTab data={data} nav={nav} />}
      {data.tab === "content" && <ContentTab data={data} />}
      {data.tab === "ads" && <AdsTab data={data} nav={nav} />}
      {data.tab === "audience" && <AudienceTab data={data} nav={nav} />}
      {data.tab === "conversations" && <ConversationsTab data={data} />}
      {data.tab === "performance" && <PerformanceTab data={data} nav={nav} />}
      {data.tab === "activity" && <ActivityTab data={data} />}
    </div>
  );
}
