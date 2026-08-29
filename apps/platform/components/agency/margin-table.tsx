import { Table } from "@wizeworks/silicaui-react";
import type { ClientRate, MarginRow, MarginTotals } from "@/lib/agency/margin";
import { CountCell, MoneyCell, PctCell } from "./margin-cell";
import { RateDialog } from "./margin-rate-dialog";

type Props = { organizationId: string; rows: MarginRow[]; totals: MarginTotals; rates: Map<string, ClientRate>; canEdit: boolean };

const HEADS = ["Client", "Billing", "Posts", "Conversations", "Revenue", "Platform share", "AI", "Ad spend", "Margin", "Margin %"];

/** Dense per-client economics. An unknown input is an em dash carrying its reason, never a 0. */
export function MarginTable({ organizationId, rows, totals, rates, canEdit }: Props) {
  return (
    <div className="mt-3 overflow-x-auto">
      <Table className="w-full text-sm">
        <thead>
          <tr>
            {HEADS.map((h, i) => (<th key={h} className={i >= 2 ? "text-right" : ""}>{h}</th>))}
            <th className="text-right">Rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <ClientRow key={r.workspaceId} row={r} organizationId={organizationId} rate={rates.get(r.workspaceId) ?? null} canEdit={canEdit} />
          ))}
        </tbody>
        <tfoot><TotalsRow totals={totals} /></tfoot>
      </Table>
    </div>
  );
}

function ClientRow({ row: r, organizationId, rate, canEdit }: { row: MarginRow; organizationId: string; rate: ClientRate | null; canEdit: boolean }) {
  return (
    <tr>
      <td className="font-medium">{r.workspaceName}</td>
      <td className={r.billingModel === "none" ? "text-secondary/70" : ""}>{r.billingLabel}</td>
      <td className="text-right tabular-nums">{r.postsPublished}</td>
      <td className="text-right tabular-nums">{r.conversationsHandled}</td>
      <td className="text-right"><MoneyCell value={r.revenue} currency={r.currency} label="Revenue" /></td>
      <td className="text-right"><MoneyCell value={r.platformShare} currency={r.currency} label="Platform share" /></td>
      <td className="text-right">
        <MoneyCell value={r.aiCost} currency={r.currency} label="AI cost" />
        <span className="ml-1 text-xs text-secondary/70"><CountCell value={r.aiCreditsUsed} reason={r.aiCreditsReason} label="AI credits" /> cr</span>
      </td>
      <td className="text-right"><MoneyCell value={r.adSpend} currency={r.currency} label="Ad spend" /></td>
      <td className="text-right"><MoneyCell value={r.margin} currency={r.currency} label="Margin" strong /></td>
      <td className="text-right"><PctCell value={r.marginPct} reason={r.marginPctReason} /></td>
      <td className="text-right">
        {canEdit
          ? <RateDialog organizationId={organizationId} workspaceId={r.workspaceId} clientName={r.workspaceName} initial={rate} />
          : <span className="text-xs text-secondary/70">View only</span>}
      </td>
    </tr>
  );
}

/** Per-currency footer: a mixed set totals nothing and says so (analytics.md). */
function TotalsRow({ totals: t }: { totals: MarginTotals }) {
  const cur = t.currency ?? "USD";
  return (
    <tr className="border-t border-base-300 font-medium">
      <td>{t.clients} client{t.clients === 1 ? "" : "s"}</td>
      <td className="text-secondary/70">{t.currency ?? "Mixed currencies"}</td>
      <td className="text-right tabular-nums">{t.postsPublished}</td>
      <td className="text-right tabular-nums">{t.conversationsHandled}</td>
      <td className="text-right"><MoneyCell value={t.revenue} currency={cur} label="Total revenue" /></td>
      <td className="text-right"><MoneyCell value={t.platformShare} currency={cur} label="Total platform share" /></td>
      <td className="text-right"><MoneyCell value={t.aiCost} currency={cur} label="Total AI cost" /></td>
      <td className="text-right"><MoneyCell value={t.adSpend} currency={cur} label="Total ad spend" /></td>
      <td className="text-right"><MoneyCell value={t.margin} currency={cur} label="Total margin" strong /></td>
      <td className="text-right"><PctCell value={t.marginPct} reason={t.marginPctReason} /></td>
      <td />
    </tr>
  );
}
