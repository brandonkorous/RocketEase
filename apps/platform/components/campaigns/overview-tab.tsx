"use client";

import Link from "next/link";
import { METRICS, formatMetric } from "@/lib/analytics/metrics";
import type { CampaignDetailData } from "@/lib/campaigns/detail";
import { OBJECTIVE_LABEL, STATUS_LABEL, formatMoney } from "@/lib/campaigns/format";
import { workspacePath } from "@/lib/nav";
import { Legend, LineChart } from "../analytics/charts";
import { Scorecards } from "../analytics/scorecard";
import { NetMark } from "../net-mark";
import type { TabNav } from "./detail-screen";
import { Empty, Panel, PeriodBar } from "./period-bar";

const EVENT_LABEL: Record<string, string> = { created: "created the campaign", updated: "updated campaign details", status: "changed status", archived: "archived the campaign", restored: "restored the campaign", content_attached: "attached content", content_detached: "removed content", ad_campaign_linked: "linked an ad campaign", ad_campaign_unlinked: "unlinked an ad campaign", ad_campaign_status: "changed an ad campaign status", promotion_confirmed: "confirmed a promotion", promotion_created: "promotion created in the ad account", promotion_failed: "promotion failed" };
export const eventLine = (e: { kind: string; actor: string | null; data: Record<string, unknown> }) => `${e.actor ?? "System"} ${EVENT_LABEL[e.kind] ?? e.kind}${typeof e.data.title === "string" ? `: ${e.data.title}` : typeof e.data.name === "string" ? `: ${e.data.name}` : e.kind === "status" ? ` to ${String(e.data.to)}` : ""}`;

function BudgetPanel({ data }: { data: CampaignDetailData }) {
  const b = data.budget;
  const cur = data.campaign.currency;
  return (
    <Panel title="Budget & spend">
      <div className="text-2xl font-bold tracking-tight">{formatMoney(b.spent, cur)}</div>
      <div className="text-xs text-secondary">Total imported spend (all time)</div>
      {b.planned !== null ? (
        <>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-base-300" role="progressbar" aria-valuenow={Math.round(b.pct ?? 0)} aria-valuemin={0} aria-valuemax={100}><div className="h-full bg-base-content" style={{ width: `${b.pct ?? 0}%` }} /></div>
          <dl className="mt-3 grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-1 text-sm">
            <dt className="text-secondary">Used</dt><dd className="text-right font-medium">{formatMoney(b.spent, cur)}</dd><dd className="text-right text-xs text-secondary">{b.pct?.toFixed(1)}%</dd>
            <dt className="text-secondary">Remaining</dt><dd className="text-right font-medium">{formatMoney(b.remaining, cur)}</dd><dd />
            <dt className="text-secondary">Planned budget</dt><dd className="text-right font-medium">{formatMoney(b.planned, cur)}</dd><dd />
            <dt className="text-secondary">Daily average</dt><dd className="text-right font-medium">{formatMoney(b.dailyAverage, cur)}</dd><dd />
          </dl>
        </>
      ) : <p className="mt-3 text-xs text-secondary/70">No planned budget. Add one in Edit campaign to track pace and cap promotions.</p>}
      <Link href={`${workspacePath(data.workspaceId, `campaigns/${data.campaign.id}`)}?tab=ads`} className="btn btn-outline btn-sm mt-4 w-full">View spend breakdown</Link>
    </Panel>
  );
}

function StatusPanel({ data }: { data: CampaignDetailData }) {
  const c = data.campaign;
  return (
    <Panel title="Campaign status">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-secondary">Status</dt><dd>{c.archived ? "Archived" : STATUS_LABEL[c.status]}</dd>
        <dt className="text-secondary">Start date</dt><dd>{c.startLabel ?? "—"}</dd>
        <dt className="text-secondary">End date</dt><dd>{c.endLabel ?? "—"}</dd>
        <dt className="text-secondary">Objective</dt><dd>{OBJECTIVE_LABEL[c.objective]}</dd>
        <dt className="text-secondary">Owner</dt><dd>{c.owner?.name ?? "Unassigned"}</dd>
        <dt className="text-secondary">Content</dt><dd>{data.contentCount} item{data.contentCount === 1 ? "" : "s"}</dd>
        <dt className="text-secondary">Campaign ID</dt><dd className="truncate font-mono text-xs">{c.id}</dd>
      </dl>
    </Panel>
  );
}

export function OverviewTab({ data, nav }: { data: CampaignDetailData; nav: TabNav }) {
  const p = data.perf!;
  const base = workspacePath(data.workspaceId, `campaigns/${data.campaign.id}`);
  const paid = p.paid;
  return (
    <>
      <PeriodBar filters={data.filters} periodLabel={data.periodLabel} compareLabel={p.compareLabel} nav={nav} />
      <Scorecards cards={p.cards} compareLabel={p.compareLabel ? `${p.compareLabel.from} – ${p.compareLabel.to}` : null} freshness={data.attribution?.freshLabel ?? null} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel title="Reach over time (by network)">
          {p.trend.length ? (<><Legend networks={[...new Set(p.trend.map((x) => x.network))]} /><div className="mt-2"><LineChart points={p.trend} /></div></>) : <Empty>No daily facts for this campaign in the period. Attach published content or link an ad campaign.</Empty>}
        </Panel>
        <BudgetPanel data={data} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Panel title="Recent organic posts" action={<Link href={`${base}?tab=content`} className="text-xs font-medium hover:underline">View all</Link>}>
          {p.top.length === 0 && <Empty>No published posts with insights in this period.</Empty>}
          <ul className="divide-y divide-base-300">
            {p.top.map((t, i) => (<li key={i} className="flex items-center gap-3 py-2 text-sm"><NetMark network={t.network} size={16} /><span className="min-w-0 flex-1"><Link href={workspacePath(data.workspaceId, `posts/${t.itemId}`)} className="block truncate font-medium hover:underline">{t.title}</Link><span className="block text-xs text-secondary/70">{t.publishedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · {t.channelName}</span></span><span className="text-right text-xs"><span className="block text-secondary">Reach</span><span className="font-semibold">{formatMetric(METRICS.reach, t.reach)}</span></span><span className="text-right text-xs"><span className="block text-secondary">Eng.</span><span className="font-semibold">{formatMetric(METRICS.engagement, t.engagement)}</span></span></li>))}
          </ul>
        </Panel>
        <Panel title="Recent activity" action={<Link href={`${base}?tab=activity`} className="text-xs font-medium hover:underline">View all</Link>}>
          {!data.activity?.length && <Empty>No activity yet.</Empty>}
          <ul className="divide-y divide-base-300 text-sm">{data.activity?.map((e) => (<li key={e.id} className="py-2"><div>{eventLine(e)}</div><div className="text-xs text-secondary/70">{e.at}</div></li>))}</ul>
        </Panel>
        <div className="flex flex-col gap-4">
          <StatusPanel data={data} />
          <Panel title="Conversion results">
            {paid.conversions == null ? <Empty>Unavailable · {p.cards.find((c) => c.contract.key === "conversions")?.unavailable ?? "No paid results yet."}</Empty> : (
              <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-sm">
                <dt className="text-secondary">Conversions (paid, provider-attributed)</dt><dd className="font-semibold">{formatMetric(METRICS.conversions, paid.conversions)}</dd>
                <dt className="text-secondary">Cost per result</dt><dd className="font-semibold">{paid.spend && paid.conversions ? formatMoney(paid.spend / paid.conversions, data.attribution?.currency ?? data.campaign.currency) : "—"}</dd>
                <dt className="text-secondary">Attribution</dt><dd className="text-xs text-secondary">{data.attribution ? `${data.attribution.model} · ${data.attribution.window}` : "provider-reported"}</dd>
              </dl>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
