"use client";

import { useState } from "react";
import { Badge, Button } from "@wizeworks/silicaui-react";
import { connectAdAccount, disconnectAdAccount, linkAdCampaign, setAdCampaignStatus, syncAdsNow } from "@/lib/actions/campaigns";
import { METRICS, formatMetric } from "@/lib/analytics/metrics";
import type { AdCampaignRow, AdsData } from "@/lib/campaigns/ads";
import type { CampaignDetailData } from "@/lib/campaigns/detail";
import { PAID_STATUS_COLOR, PAID_STATUS_LABEL, formatMoney } from "@/lib/campaigns/format";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { Scorecards } from "../analytics/scorecard";
import { NetMark } from "../net-mark";
import type { TabNav } from "./detail-screen";
import { Empty, Panel, PeriodBar } from "./period-bar";
import { PromoteDialog } from "./promote-dialog";

function AccountsPanel({ data, ads, nav }: { data: CampaignDetailData; ads: AdsData; nav: TabNav }) {
  const { run, pending } = useActionFeedback();
  return (
    <Panel title="Ad accounts" action={data.canManage ? <span className="flex gap-1"><Button size="xs" variant="ghost" color="neutral" loading={pending} onClick={() => run(() => syncAdsNow(data.workspaceId))}>Sync now</Button><Button size="xs" variant="outline" color="neutral" onClick={() => nav({ connect: ads.available ? null : "1" })}>{ads.available ? "Close" : "Connect ad account"}</Button></span> : undefined}>
      {ads.accounts.length === 0 && !ads.available && <Empty>No ad account connected. Connect one to import paid campaigns, spend and conversions (read-only).</Empty>}
      <ul className="divide-y divide-base-300 text-sm">
        {ads.accounts.map((a) => (<li key={a.id} className="flex flex-wrap items-center gap-3 py-2"><NetMark network={a.network ?? a.provider} size={16} /><span className="min-w-0 flex-1"><span className="block font-medium">{a.name} <span className="text-xs text-secondary">({a.currency})</span></span><span className="block text-xs text-secondary/70">{a.lastError ? <span className="text-warning">{a.lastError}</span> : a.lastSync ? `Imported ${a.lastSync}` : "Import queued"}</span></span><Badge size="xs" variant="soft" color={a.status === "active" ? "success" : "warning"}>{a.status}</Badge>{a.managerUrl && <a href={a.managerUrl} target="_blank" rel="noreferrer" className="text-xs font-medium hover:underline">Open in manager ↗</a>}{data.canManage && <Button size="xs" variant="ghost" color="neutral" loading={pending} onClick={() => { if (window.confirm(`Disconnect ${a.name}? Imported history stays.`)) run(() => disconnectAdAccount(data.workspaceId, a.id)); }}>Disconnect</Button>}</li>))}
      </ul>
      {ads.available && (
        <div className="mt-3 rounded-field border border-dashed border-base-300 p-3">
          <div className="text-xs font-medium text-secondary">Available to your connections</div>
          {ads.available.length === 0 && <Empty>No active connection exposes ad accounts. Connect a network under Connected accounts first.</Empty>}
          {ads.available.map((g) => (
            <div key={g.connectionId} className="mt-2">
              <div className="text-sm font-medium">{g.providerName}{g.error && <span className="ml-2 text-xs text-error">{g.error}</span>}</div>
              {g.accounts.length === 0 && !g.error && <div className="text-xs text-secondary/70">All ad accounts on this login are already connected.</div>}
              <ul className="mt-1 flex flex-col gap-1">{g.accounts.map((a) => (<li key={a.remoteId} className="flex items-center justify-between gap-2 text-sm"><span>{a.name} <span className="text-xs text-secondary">({a.currency} · {a.status})</span></span><Button size="xs" color="primary" loading={pending} onClick={() => run(() => connectAdAccount(data.workspaceId, g.connectionId, a.remoteId), () => nav({ connect: null }))}>Connect</Button></li>))}</ul>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function CampaignRow({ r, data, ads }: { r: AdCampaignRow; data: CampaignDetailData; ads: AdsData }) {
  const { run, pending } = useActionFeedback();
  const m = (v: number | null, k: keyof typeof METRICS) => (v === null ? <span className="text-secondary/50" title="Not reported by the provider for this period">—</span> : k === "spend" || k === "cpm" || k === "cpc" ? formatMoney(v, r.currency) : formatMetric(METRICS[k], v));
  return (
    <tr>
      <td className="py-2"><span className="flex items-center gap-2"><NetMark network={r.network ?? "mock"} size={14} /><span className="min-w-0"><span className="block truncate font-medium">{r.name}</span><span className="block text-xs text-secondary/70">{r.accountName} · {r.budget}{r.fromPromotion ? " · from promotion" : ""}</span></span></span></td>
      <td className="py-2 text-xs">{r.objective ?? "—"}</td>
      <td className="py-2"><Badge size="xs" variant="soft" color={PAID_STATUS_COLOR[r.status] ?? "neutral"}>{PAID_STATUS_LABEL[r.status] ?? r.status}</Badge></td>
      <td className="py-2 text-right font-semibold">{m(r.spend, "spend")}</td>
      <td className="py-2 text-right">{m(r.cpm, "cpm")}</td>
      <td className="py-2 text-right">{m(r.cpc, "cpc")}</td>
      <td className="py-2 text-right">{m(r.ctr, "ctr_paid")}</td>
      <td className="py-2 text-right">{m(r.conversions, "conversions")}</td>
      <td className="py-2 text-right"><span className="flex justify-end gap-1">
        {data.canManage && ads.showAll && <select className="select select-xs w-auto" value={r.linked?.id ?? ""} onChange={(e) => run(() => linkAdCampaign(data.workspaceId, r.id, e.target.value || null))} aria-label="Link to campaign"><option value="">Unlinked</option>{ads.campaigns.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}</select>}
        {data.canManage && r.canToggle && <Button size="xs" variant="outline" color="neutral" loading={pending} onClick={() => run(() => setAdCampaignStatus(data.workspaceId, r.id, r.status === "active" ? "paused" : "active"))}>{r.status === "active" ? "Pause" : "Resume"}</Button>}
        {r.managerUrl && <a href={r.managerUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-xs">Manager ↗</a>}
      </span></td>
    </tr>
  );
}

function PromotePanel({ data, ads }: { data: CampaignDetailData; ads: AdsData }) {
  const [open, setOpen] = useState<string | null>(null);
  const post = ads.eligible.find((p) => p.variantId === open);
  return (
    <Panel title="Promote a post">
      {post && <PromoteDialog post={post} data={data} onClose={() => setOpen(null)} />}
      {ads.eligible.length === 0 && <Empty>No published posts in this campaign yet. Promotion candidates appear after publication (flows.md).</Empty>}
      <ul className="divide-y divide-base-300 text-sm">
        {ads.eligible.map((p) => (<li key={p.variantId} className="flex flex-wrap items-center gap-3 py-2"><NetMark network={p.channel.network} size={16} /><span className="min-w-0 flex-1"><span className="block truncate font-medium">{p.title}</span><span className="block truncate text-xs text-secondary/70">{p.channel.name} · {p.publishedAt}{p.url ? " · " : ""}{p.url && <a href={p.url} target="_blank" rel="noreferrer" className="hover:underline">View post ↗</a>}</span></span>{p.blocked ? <span className="text-xs text-secondary" title={p.blocked}>Not eligible · {p.blocked}</span> : data.canManage ? <Button size="xs" color="primary" variant="outline" onClick={() => setOpen(p.variantId)}>Promote</Button> : <span className="text-xs text-secondary">Eligible (manager only)</span>}</li>))}
      </ul>
      {ads.promotions.length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-medium text-secondary">Promotion history</div>
          <ul className="mt-1 divide-y divide-base-300 text-sm">{ads.promotions.map((p) => (<li key={p.id} className="flex flex-wrap items-center gap-2 py-2"><span className="min-w-0 flex-1"><span className="block truncate">{p.name}</span><span className="block text-xs text-secondary/70">{p.account} · {p.budget} · {p.at}{p.error ? ` · ${p.error}` : ""}</span></span><Badge size="xs" variant="soft" color={p.status === "created" ? "success" : p.status === "failed" ? "error" : "info"}>{p.status}</Badge>{p.managerUrl && <a href={p.managerUrl} target="_blank" rel="noreferrer" className="text-xs font-medium hover:underline">Manager ↗</a>}</li>))}</ul>
        </div>
      )}
    </Panel>
  );
}

/** Ads inside campaign detail per images/ads.png: paid scorecards, accounts, imported campaigns table, promotion. */
export function AdsTab({ data, nav }: { data: CampaignDetailData; nav: TabNav }) {
  const ads = data.ads!;
  return (
    <>
      <PeriodBar filters={data.filters} periodLabel={data.periodLabel} compareLabel={null} nav={nav} right={ads.attribution && <span className="text-xs text-secondary">Attribution: {ads.attribution.model} · {ads.attribution.window} · {ads.attribution.currency} · {ads.attribution.freshLabel ? `refreshed ${ads.attribution.freshLabel}` : "not synced yet"}</span>} />
      <Scorecards cards={ads.cards} compareLabel={data.filters.compare === "none" ? null : "previous period"} freshness={ads.attribution?.freshLabel ?? null} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <AccountsPanel data={data} ads={ads} nav={nav} />
        <PromotePanel data={data} ads={ads} />
      </div>
      <Panel title={ads.showAll ? "All imported ad campaigns" : "Ad campaigns linked to this campaign"} action={<Button size="xs" variant="ghost" color="neutral" onClick={() => nav({ all: ads.showAll ? null : "1" })}>{ads.showAll ? "Show linked only" : "Show all in workspace"}</Button>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-200 text-sm">
            <thead className="text-xs text-secondary"><tr><th className="pb-2 text-left font-medium">Campaign</th><th className="pb-2 text-left font-medium">Objective</th><th className="pb-2 text-left font-medium">Status</th><th className="pb-2 text-right font-medium">Spend</th><th className="pb-2 text-right font-medium">CPM</th><th className="pb-2 text-right font-medium">CPC</th><th className="pb-2 text-right font-medium">CTR</th><th className="pb-2 text-right font-medium">Conversions</th><th /></tr></thead>
            <tbody className="divide-y divide-base-300">
              {ads.adCampaigns.map((r) => (<CampaignRow key={r.id} r={r} data={data} ads={ads} />))}
              {ads.adCampaigns.length === 0 && <tr><td colSpan={9}><Empty>{ads.showAll ? "Nothing imported yet. Connect an ad account and sync." : "No ad campaign is linked. Show all in workspace and link one, or promote a post."}</Empty></td></tr>}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-secondary/70">Figures are for {data.periodLabel} in each account's currency. CPM/CPC/CTR derive from imported spend, impressions and link clicks; “—” means the provider reported nothing for that metric.</p>
      </Panel>
    </>
  );
}
