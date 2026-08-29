import { Table } from "@wizeworks/silicaui-react";
import { formatCredits } from "@/lib/ai/usage/credits";
import type { WorkspaceCreditRow } from "@/lib/billing/queries";

/**
 * Agency view: every workspace in the organization with its included and used
 * AI credits for the billing period. Overage is what the meter reports.
 */
export function WorkspaceCredits({ rows, periodLabel }: { rows: WorkspaceCreditRow[]; periodLabel: string | null }) {
  return (
    <section aria-labelledby="billing-workspaces">
      <h3 id="billing-workspaces" className="text-base font-semibold">AI credits by workspace</h3>
      <p className="mt-1 text-sm text-secondary">
        {periodLabel ? `This billing period (${periodLabel}).` : "This calendar month."} Each workspace includes its own allowance; only credits above it are billed.
      </p>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-secondary">No AI has been used in this organization yet.</p>
      ) : (
        <Table className="mt-3 w-full">
          <thead>
            <tr>
              <th>Workspace</th>
              <th>Included</th>
              <th>Used</th>
              <th>Over allowance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.workspaceId}>
                <td className="font-medium">{r.name}</td>
                <td className="text-secondary">{formatCredits(r.included)}</td>
                <td>{formatCredits(r.used)}</td>
                <td>{r.overage > 0 ? formatCredits(r.overage) : <span className="text-secondary/70">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </section>
  );
}
