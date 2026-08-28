"use client";

import type { AnalyticsFilters } from "@/lib/analytics/periods";
import type { TabNav } from "./detail-screen";

/** Persistent date/comparison/scope filters (pages.md Analytics) reused inside campaign tabs. */
export function PeriodBar({ filters, periodLabel, compareLabel, nav, right }: { filters: AnalyticsFilters; periodLabel: string; compareLabel: { from: string; to: string } | null; nav: TabNav; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <select className="select select-sm w-auto" value={filters.preset} onChange={(e) => nav({ range: e.target.value, from: null, to: null })} aria-label="Date range">
          <option value="7d">Last 7 days</option><option value="28d">Last 28 days</option><option value="90d">Last 90 days</option><option value="custom">Custom…</option>
        </select>
        {filters.preset === "custom" && (<><input type="date" className="input input-sm w-auto" value={filters.from} onChange={(e) => nav({ range: "custom", from: e.target.value })} aria-label="From" /><input type="date" className="input input-sm w-auto" value={filters.to} onChange={(e) => nav({ range: "custom", to: e.target.value })} aria-label="To" /></>)}
        <select className="select select-sm w-auto" value={filters.compare} onChange={(e) => nav({ compare: e.target.value === "previous" ? null : e.target.value })} aria-label="Comparison">
          <option value="previous">Compare: previous period</option><option value="year">Compare: previous year</option><option value="none">No comparison</option>
        </select>
        <select className="select select-sm w-auto" value={filters.scope} onChange={(e) => nav({ scope: e.target.value === "all" ? null : e.target.value })} aria-label="Scope">
          <option value="all">Organic + paid</option><option value="organic">Organic only</option><option value="paid">Paid only</option>
        </select>
        <span className="text-xs text-secondary">{periodLabel}{compareLabel ? ` · vs ${compareLabel.from} – ${compareLabel.to}` : ""}</span>
      </div>
      {right}
    </div>
  );
}

export function Panel({ title, action, children, className = "" }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`flex flex-col rounded-box border border-base-300 p-4 ${className}`} aria-label={title}>
      <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold">{title}</h2>{action}</div>
      <div className="mt-3 flex-1">{children}</div>
    </section>
  );
}

export const Empty = ({ children }: { children: React.ReactNode }) => <p className="py-4 text-center text-xs text-secondary/70">{children}</p>;
