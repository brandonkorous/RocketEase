"use client";

import { SearchInput } from "@wizeworks/silicaui-react";
import { GROUP_LABEL, type AccountGroup } from "@/lib/accounts/types";

export type TabKey = "all" | AccountGroup;
export type Filters = { tab: TabKey; q: string; status: string; type: string };

export const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "All integrations" },
  { key: "social", label: GROUP_LABEL.social },
  { key: "ads", label: GROUP_LABEL.ads },
  { key: "analytics", label: GROUP_LABEL.analytics },
];

type Props = { filters: Filters; setFilters: (patch: Partial<Filters>) => void; types: string[]; counts: Record<TabKey, number> };

export function AccountsToolbar({ filters, setFilters, types, counts }: Props) {
  return (
    <>
      <div className="flex gap-6 overflow-x-auto border-b border-base-300 px-5" role="tablist" aria-label="Integration types">
        {TABS.map((t) => {
          const active = filters.tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilters({ tab: t.key })}
              className={`flex items-center gap-2 whitespace-nowrap border-b-2 py-3.5 text-sm ${active ? "border-base-content font-semibold" : "border-transparent text-secondary hover:text-base-content"}`}
            >
              <span>{t.label}</span>
              <span className="rounded-full bg-base-200 px-2 py-0.5 text-xs text-secondary">{counts[t.key]}</span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3 border-b border-base-300 px-5 py-3">
        <SearchInput className="min-w-60 flex-1" placeholder="Search accounts..." aria-label="Search accounts" value={filters.q} onChange={(e) => setFilters({ q: e.target.value })} />
        <select className="select select-sm w-auto" aria-label="Filter by status" value={filters.status} onChange={(e) => setFilters({ status: e.target.value })}>
          <option value="">All status</option>
          <option value="success">Healthy</option>
          <option value="warning">Warnings</option>
          <option value="error">Errors</option>
          <option value="info">Connecting</option>
        </select>
        <select className="select select-sm w-auto" aria-label="Filter by type" value={filters.type} onChange={(e) => setFilters({ type: e.target.value })}>
          <option value="">All types</option>
          {types.map((t) => (<option key={t} value={t}>{t}</option>))}
        </select>
      </div>
    </>
  );
}
