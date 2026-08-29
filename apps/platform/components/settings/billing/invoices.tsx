import { Table } from "@wizeworks/silicaui-react";
import type { InvoiceRow } from "@/lib/billing/queries";
import { INVOICE_STATUS } from "@/lib/billing/view";

/** The last 12 invoices, straight from Stripe. Receipts and PDFs live there too. */
export function Invoices({ invoices, timezone }: { invoices: InvoiceRow[]; timezone: string }) {
  return (
    <section aria-labelledby="billing-invoices">
      <h3 id="billing-invoices" className="text-base font-semibold">Invoices</h3>
      {invoices.length === 0 ? (
        <p className="mt-1 text-sm text-secondary">No invoices yet. They appear here once the first billing period closes.</p>
      ) : (
        <Table className="mt-3 w-full">
          <thead>
            <tr>
              <th>Date</th>
              <th>Invoice</th>
              <th>Amount</th>
              <th>Status</th>
              <th className="text-right">Open</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id}>
                <td className="whitespace-nowrap text-secondary">
                  {new Intl.DateTimeFormat("en-US", { timeZone: timezone, dateStyle: "medium" }).format(new Date(inv.date))}
                </td>
                <td className="font-mono text-xs">{inv.number ?? "—"}</td>
                <td>{inv.amount ?? "—"}</td>
                <td>{INVOICE_STATUS[inv.status] ?? inv.status}</td>
                <td className="text-right">
                  {inv.url ? (
                    <a href={inv.url} target="_blank" rel="noreferrer" className="text-sm font-medium underline underline-offset-2">
                      View
                    </a>
                  ) : (
                    <span className="text-sm text-secondary/70">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </section>
  );
}
