"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@wizeworks/silicaui-react";
import { refreshInsightsNow } from "@/lib/actions/analytics";
import { filtersToQuery, type AnalyticsFilters } from "@/lib/analytics/periods";
import { workspacePath } from "@/lib/nav";
import { useActionFeedback } from "@/lib/use-action-feedback";
import type { AnalyticsData } from "@/lib/analytics/screen";
import { SourceHealth } from "./source-health";

export function AnalyticsFilterBar({ data }: { data: AnalyticsData }) {
  const router = useRouter();
  const { run, pending } = useActionFeedback();
  const f = data.filters;
  const go = (patch: Partial<AnalyticsFilters>) => router.push(`${workspacePath(data.workspaceId, "analytics")}?${filtersToQuery({ ...f, ...patch })}`);
  const exportHref = `${workspacePath(data.workspaceId, "analytics/export")}?${filtersToQuery(f)}`;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <select className="select select-sm w-auto" value={f.preset} onChange={(e) => go({ preset: e.target.value as AnalyticsFilters["preset"] })} aria-label="Date range">
          <option value="7d">Last 7 days</option><option value="28d">Last 28 days</option><option value="90d">Last 90 days</option><option value="custom">Custom…</option>
        </select>
        {f.preset === "custom" && (
          <>
            <input type="date" className="input input-sm w-auto" value={f.from} onChange={(e) => go({ preset: "custom", from: e.target.value })} aria-label="From" />
            <input type="date" className="input input-sm w-auto" value={f.to} onChange={(e) => go({ preset: "custom", to: e.target.value })} aria-label="To" />
          </>
        )}
        <select className="select select-sm w-auto" value={f.channelId ?? ""} onChange={(e) => go({ channelId: e.target.value || undefined })} aria-label="Channel">
          <option value="">All channels</option>{data.channels.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
        </select>
        <select className="select select-sm w-auto" value={f.campaignId ?? ""} onChange={(e) => go({ campaignId: e.target.value || undefined })} aria-label="Campaign"><option value="">All campaigns</option>{data.campaigns.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}</select>
        <select className="select select-sm w-auto" value={f.scope} onChange={(e) => go({ scope: e.target.value as AnalyticsFilters["scope"] })} aria-label="Scope">
          <option value="all">Organic + paid</option><option value="organic">Organic only</option><option value="paid">Paid only</option>
        </select>
        <select className="select select-sm w-auto" value={f.compare} onChange={(e) => go({ compare: e.target.value as AnalyticsFilters["compare"] })} aria-label="Comparison">
          <option value="previous">Compare: previous period</option><option value="year">Compare: previous year</option><option value="none">No comparison</option>
        </select>
        {data.canExport && <Link href={exportHref} className="btn btn-primary btn-sm">Export CSV</Link>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-secondary">
        <span>{data.periodLabel}{data.compareLabel ? ` · compared with ${data.compareLabel}` : ""} · {data.timezone}</span>
        <span className="flex items-center gap-2">
          {data.refreshedLabel ? `Data refreshed ${data.refreshedLabel}` : "No insights ingested yet"}
          <SourceHealth workspaceId={data.workspaceId} stale={data.stale} />
          {/* Info-level findings (e.g. a definition break) are notes, not problems: they never colour the header. */}
          {data.quality.open > 0 && <span className={data.quality.issues.some((i) => i.severity !== "info") ? "text-warning" : undefined} title={data.quality.issues.map((i) => `${i.severity}: ${i.message}`).join("\n")}>· {data.quality.open} data quality note{data.quality.open > 1 ? "s" : ""}</span>}
          <Button size="xs" variant="ghost" color="neutral" loading={pending} onClick={() => run(() => refreshInsightsNow(data.workspaceId))}>Refresh</Button>
        </span>
      </div>
    </div>
  );
}
