"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { buttonClasses } from "@wizeworks/silicaui-react/server";
import { disconnectAdAccount, syncAdsNow } from "@/lib/actions/campaigns";
import { discardConnection, disconnectChannel, resyncChannel } from "@/lib/actions/connections";
import { disconnectTrackingSource, syncTrackingSourceNow } from "@/lib/actions/settings/tracking-sources";
import { workspacePath } from "@/lib/nav";
import { useActionFeedback } from "@/lib/use-action-feedback";
import type { AccountsData, AccountGroup, IntegrationRow, PendingRow } from "@/lib/accounts/types";
import { AppPage, PageHeader } from "../page-frame";
import { ConnectMenu } from "./connect-menu";
import { DisconnectDialog } from "./disconnect-dialog";
import { GroupSection, ListEmpty } from "./list";
import { AccountsRail } from "./rail";
import { AccountsToolbar, TABS, type Filters, type TabKey } from "./toolbar";

const GROUPS: AccountGroup[] = ["social", "ads", "analytics"];
const BLANK: Filters = { tab: "all", q: "", status: "", type: "" };

export function AccountsScreen({ data }: { data: AccountsData }) {
  const { run, pending } = useActionFeedback();
  const [filters, setState] = useState<Filters>(BLANK);
  const [confirm, setConfirm] = useState<IntegrationRow | null>(null);
  const setFilters = (patch: Partial<Filters>) => setState((f) => ({ ...f, ...patch }));

  const visible = useMemo(() => matching(data.rows, filters), [data.rows, filters]);
  const types = useMemo(() => [...new Set(data.rows.map((r) => r.typeLabel))].sort(), [data.rows]);
  const counts = useMemo(() => tabCounts(data.rows), [data.rows]);
  const groups = GROUPS.filter((g) => (filters.tab === "all" || filters.tab === g) && visible.some((r) => r.group === g));

  return (
    <AppPage>
      <PageHeader
        title="Connected accounts"
        description="Social profiles, pages, ad accounts, and conversion sources with their permissions and health."
        actions={
          <>
            <Link href={workspacePath(data.workspaceId, "settings/audit")} className={buttonClasses({ variant: "outline", color: "neutral" })}>View activity log</Link>
            {data.canManage && <ConnectMenu data={data} />}
          </>
        }
      />
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0 rounded-box border border-base-300">
          <AccountsToolbar filters={filters} setFilters={setFilters} types={types} counts={counts} />
          {groups.map((g) => (
            <GroupSection
              key={g}
              group={g}
              rows={visible.filter((r) => r.group === g)}
              canManage={data.canManage}
              pending={pending}
              showFooter={filters.tab === "all"}
              onSync={(row) => run(() => syncAction(data.workspaceId, row))}
              onDisconnect={setConfirm}
              onViewAll={(group) => setFilters({ tab: group })}
            />
          ))}
          {groups.length === 0 && <Empty data={data} filters={filters} onClear={() => setState(BLANK)} />}
        </div>
        <AccountsRail
          data={data}
          pending={pending}
          onDiscard={(row: PendingRow) => run(() => discardConnection(data.workspaceId, row.id))}
          onShowTone={(tone) => setFilters({ tab: "all", status: tone })}
        />
      </div>
      {confirm && (
        <DisconnectDialog
          row={confirm}
          pending={pending}
          onCancel={() => setConfirm(null)}
          onConfirm={() => { const row = confirm; setConfirm(null); run(() => disconnectAction(data.workspaceId, row)); }}
        />
      )}
    </AppPage>
  );
}

function Empty({ data, filters, onClear }: { data: AccountsData; filters: Filters; onClear: () => void }) {
  if (data.rows.length > 0) {
    return (
      <ListEmpty
        title="Nothing matches those filters"
        description={`No ${filters.tab === "all" ? "integration" : TABS.find((t) => t.key === filters.tab)?.label.toLowerCase()} matches what you searched for.`}
        action={<button type="button" onClick={onClear} className={buttonClasses({ size: "sm", variant: "outline", color: "neutral" })}>Clear filters</button>}
      />
    );
  }
  return (
    <ListEmpty
      title="No accounts are connected yet"
      description={
        data.connectable.length
          ? "Connect a network to publish, read your inbox, and measure results. You choose exactly which pages or accounts join this workspace after signing in."
          : "Provider credentials are not configured in this deployment. In development set PROVIDERS_ENABLE_MOCK=1 to use the demo network."
      }
      action={data.canManage && data.connectable.length > 0 ? <ConnectMenu data={data} /> : undefined}
    />
  );
}

function matching(rows: IntegrationRow[], f: Filters): IntegrationRow[] {
  const q = f.q.trim().toLowerCase();
  return rows.filter(
    (r) =>
      (f.tab === "all" || r.group === f.tab) &&
      (!f.status || r.status.tone === f.status) &&
      (!f.type || r.typeLabel === f.type) &&
      (!q || `${r.typeLabel} ${r.name}`.toLowerCase().includes(q)),
  );
}

function tabCounts(rows: IntegrationRow[]): Record<TabKey, number> {
  return { all: rows.length, social: rows.filter((r) => r.group === "social").length, ads: rows.filter((r) => r.group === "ads").length, analytics: rows.filter((r) => r.group === "analytics").length };
}

/** Each group re-checks itself through its own owner: channels, ad accounts, conversion sources. */
function syncAction(workspaceId: string, row: IntegrationRow) {
  if (row.group === "social") return resyncChannel(workspaceId, row.id);
  if (row.group === "ads") return syncAdsNow(workspaceId);
  return syncTrackingSourceNow({ workspaceId, sourceId: row.id });
}

function disconnectAction(workspaceId: string, row: IntegrationRow) {
  if (row.group === "social") return disconnectChannel(workspaceId, row.id);
  if (row.group === "ads") return disconnectAdAccount(workspaceId, row.id);
  return disconnectTrackingSource({ workspaceId, sourceId: row.id });
}
