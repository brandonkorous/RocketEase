"use client";

import Link from "next/link";
import type { AnalyticsData } from "@/lib/analytics/screen";
import { workspacePath } from "@/lib/nav";
import { AnalyticsFilterBar } from "./analytics/filters";
import { AttributionPanel, AudiencePanel, ChannelMixPanel, FunnelPanel, OrganicVsPaid, TopPostsPanel, TrendPanel } from "./analytics/panels";
import { Scorecards } from "./analytics/scorecard";

/** Analytics overview per images/analytics.png: filters, scorecard, then panel grid. */
export function AnalyticsScreen({ data }: { data: AnalyticsData }) {
  return (
    <div className="mx-auto flex w-full max-w-360 flex-col gap-4 px-4 py-5 lg:px-8">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div><h1 className="app-title">Analytics &amp; Reports</h1><p className="mt-1 text-base text-secondary">Track performance across all your social channels and campaigns.</p></div>
      </div>
      <AnalyticsFilterBar data={data} />
      {!data.hasData && (
        <div className="rounded-box border border-dashed border-base-300 p-6 text-center text-sm text-secondary">
          {data.channels.length === 0 ? (<>No channels connected yet. <Link href={workspacePath(data.workspaceId, "accounts")} className="font-medium hover:underline">Connect a channel</Link> and insights start flowing after the first sync.</>) : "Insights haven't been ingested for this period yet. The worker pulls them every 15 minutes — or press Refresh."}
        </div>
      )}
      <Scorecards cards={data.scorecard} compareLabel={data.compareLabel} freshness={data.refreshedLabel} />
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)]">
        <OrganicVsPaid data={data} />
        <TrendPanel data={data} />
        <FunnelPanel data={data} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <AudiencePanel data={data} />
        <ChannelMixPanel data={data} />
        <TopPostsPanel data={data} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <AttributionPanel data={data} />
        <section className="rounded-box border border-base-300 p-4 xl:col-span-2" aria-label="Reports">
          <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Reports</h2><span className="flex items-center gap-3"><Link href={workspacePath(data.workspaceId, "analytics/recommendations")} className="text-xs font-medium hover:underline">Recommendations →</Link><Link href={workspacePath(data.workspaceId, "reports")} className="text-xs font-medium hover:underline">View all reports →</Link></span></div>
          <p className="mt-3 text-sm text-secondary">Save this view as a report, export it as CSV with definitions and freshness stamped, or schedule it for delivery.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`${workspacePath(data.workspaceId, "reports")}?new=1&from=${data.filters.from}&to=${data.filters.to}&range=${data.filters.preset}${data.filters.channelId ? `&channel=${data.filters.channelId}` : ""}`} className="btn btn-outline btn-sm">Save as report</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
