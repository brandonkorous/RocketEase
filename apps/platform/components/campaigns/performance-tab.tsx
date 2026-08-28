"use client";

import Link from "next/link";
import { METRICS, formatMetric } from "@/lib/analytics/metrics";
import { filtersToQuery } from "@/lib/analytics/periods";
import { engagementOf } from "@/lib/analytics/derive";
import { conversionsUnavailable } from "@/lib/tracking/availability";
import type { CampaignDetailData } from "@/lib/campaigns/detail";
import { workspacePath } from "@/lib/nav";
import { Legend, LineChart } from "../analytics/charts";
import { Scorecards } from "../analytics/scorecard";
import { NetMark } from "../net-mark";
import type { TabNav } from "./detail-screen";
import { Empty, Panel, PeriodBar } from "./period-bar";

const ROWS = ["reach", "impressions", "engagement", "link_clicks"] as const;

/** Performance = the analytics helpers restricted to this campaign (deterministic attribution), organic vs paid side by side. */
export function PerformanceTab({ data, nav }: { data: CampaignDetailData; nav: TabNav }) {
  const p = data.perf!;
  const analyticsHref = `${workspacePath(data.workspaceId, "analytics")}?${filtersToQuery({ ...data.filters, campaignId: data.campaign.id })}`;
  return (
    <>
      <PeriodBar filters={data.filters} periodLabel={data.periodLabel} compareLabel={p.compareLabel} nav={nav} right={<Link href={analyticsHref} className="btn btn-outline btn-sm">Open in Analytics</Link>} />
      <Scorecards cards={p.cards} compareLabel={p.compareLabel ? `${p.compareLabel.from} – ${p.compareLabel.to}` : null} freshness={data.attribution?.freshLabel ?? null} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <OrganicVsPaid data={data} />
        <Panel title="Reach over time (by network)">
          {p.trend.length ? (<><Legend networks={[...new Set(p.trend.map((x) => x.network))]} /><div className="mt-2"><LineChart points={p.trend} /></div></>) : <Empty>No daily facts in this period.</Empty>}
        </Panel>
      </div>
      <Panel title="Top posts in this campaign">
        <table className="w-full text-sm">
          <thead className="text-xs text-secondary"><tr><th className="pb-1 text-left font-medium">Post</th><th className="pb-1 text-right font-medium">Reach</th><th className="pb-1 text-right font-medium">Engagement</th><th className="pb-1 text-right font-medium">Clicks</th></tr></thead>
          <tbody className="divide-y divide-base-300">
            {p.top.map((t, i) => (<tr key={i}><td className="py-2"><Link href={workspacePath(data.workspaceId, `posts/${t.itemId}`)} className="flex items-center gap-2 hover:underline"><NetMark network={t.network} size={14} /><span className="min-w-0"><span className="block truncate font-medium">{t.title}</span><span className="block text-xs text-secondary/70">{t.publishedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · {t.channelName}</span></span></Link></td><td className="py-2 text-right">{formatMetric(METRICS.reach, t.reach)}</td><td className="py-2 text-right font-semibold">{formatMetric(METRICS.engagement, t.engagement)}</td><td className="py-2 text-right">{formatMetric(METRICS.link_clicks, t.clicks)}</td></tr>))}
            {p.top.length === 0 && <tr><td colSpan={4}><Empty>No published posts with insights in this period.</Empty></td></tr>}
          </tbody>
        </table>
      </Panel>
    </>
  );
}

/**
 * Organic vs paid, with the site-reported conversion half labelled by its own
 * model / window / currency / freshness (analytics.md: attribution always shows
 * where a number came from).
 */
function OrganicVsPaid({ data }: { data: CampaignDetailData }) {
  const p = data.perf!;
  const hasPaid = p.paid.spend != null;
  const hasOrganic = Object.keys(p.organic).length > 0;
  const cell = (t: typeof p.organic, k: (typeof ROWS)[number], has: boolean) => { const v = (k === "engagement" ? engagementOf(t) : t[k]) ?? (has ? 0 : null); return v === null ? <span className="text-secondary/50">—</span> : formatMetric(METRICS[k], v); };
  const why = conversionsUnavailable(p.conversions, false);
  const c = p.conversionProvenance;
  return (
    <Panel title="Organic vs paid">
      <table className="w-full text-sm">
        <thead className="text-xs text-secondary"><tr><th className="pb-2 text-left font-medium">Metric</th><th className="pb-2 text-right font-medium">Organic</th><th className="pb-2 text-right font-medium">Paid</th></tr></thead>
        <tbody className="divide-y divide-base-300">
          {ROWS.map((k) => (<tr key={k}><td className="py-2">{METRICS[k].name}</td><td className="py-2 text-right font-semibold">{cell(p.organic, k, hasOrganic)}</td><td className="py-2 text-right font-semibold">{cell(p.paid, k, hasPaid)}</td></tr>))}
          <tr>
            <td className="py-2">Conversions</td>
            <td className="py-2 text-right font-semibold">{why ? <span className="text-secondary/70" title={why}>—</span> : formatMetric(METRICS.conversions, p.organic.conversions ?? 0)}</td>
            <td className="py-2 text-right font-semibold">{p.paid.conversions == null ? <span className="text-secondary/50">—</span> : formatMetric(METRICS.conversions, p.paid.conversions)}</td>
          </tr>
          <tr><td className="py-2">Spend</td><td className="py-2 text-right text-secondary/70">n/a</td><td className="py-2 text-right font-semibold">{p.paid.spend == null ? <span className="text-secondary/50">—</span> : formatMetric(METRICS.spend, p.paid.spend)}</td></tr>
        </tbody>
      </table>
      <p className="mt-2 text-xs text-secondary/70">Organic = facts on the campaign's published posts. Paid = facts on ad campaigns linked to this campaign{data.attribution ? ` (${data.attribution.currency})` : ""}. {METRICS.reach.caveat}</p>
      {c ? <SourceProvenance p={p} /> : <p className="mt-2 text-xs text-secondary/70">{why}</p>}
    </Panel>
  );
}

/** The site-reported half: whose numbers these are, under which model and window. */
function SourceProvenance({ p }: { p: NonNullable<CampaignDetailData["perf"]> }) {
  const c = p.conversionProvenance!;
  return (
    <div className="mt-3 border-t border-base-300 pt-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-secondary">Site-reported conversions</h3>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
        <dt className="text-secondary">Model</dt><dd>{c.model}</dd>
        <dt className="text-secondary">Window</dt><dd>{c.window}</dd>
        <dt className="text-secondary">Source</dt><dd>{c.sources.join(", ")}</dd>
        <dt className="text-secondary">Currency</dt><dd>{c.currency} (no conversion applied)</dd>
        <dt className="text-secondary">Freshness</dt><dd>{p.conversionsFreshLabel ?? "never synced"}</dd>
      </dl>
      <p className="mt-2 text-xs text-secondary/70">Matched on this campaign's utm_campaign. Paid clicks are counted once by the ad platform and never again here.</p>
    </div>
  );
}
