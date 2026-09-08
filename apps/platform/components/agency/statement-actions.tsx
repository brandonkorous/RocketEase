"use client";

import { useState } from "react";
import { Button, Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, Table } from "@wizeworks/silicaui-react";
import { disconnectStripe, refreshStatement, sendStatement, voidStatement } from "@/lib/actions/agency/statements";
import { formatMoney } from "@/lib/agency/margin";
import type { StatementDraft, StatementStatus } from "@/lib/agency/statement";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { ConfirmDialog } from "../confirm-dialog";

export type StatementCell = { id: string; status: StatementStatus; hostedInvoiceUrl: string | null; number: string | null } | null;
type Props = { organizationId: string; workspaceId: string; clientName: string; periodKey: string; periodLabel: string; draft: StatementDraft | null; blocked: string | null; sendBlocked: string | null; statement: StatementCell };

/** The month's lines, then Send — the one place an invoice leaves from. */
function PreviewDialog({ organizationId, workspaceId, clientName, periodKey, periodLabel, draft, sendBlocked }: Omit<Props, "blocked" | "statement"> & { draft: StatementDraft }) {
  const { run, pending } = useActionFeedback();
  const [open, setOpen] = useState(false);
  const send = () => run(() => sendStatement(organizationId, workspaceId, periodKey), (r) => { if (!r.error) setOpen(false); });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="xs" variant="outline" color="neutral" onClick={() => setOpen(true)}>Preview</Button>
      <DialogContent className="max-w-150">
        <DialogTitle>Statement for {clientName} — {periodLabel}</DialogTitle>
        <DialogDescription className="mt-1 text-sm text-secondary">These lines become an invoice from your own Stripe account, due 30 days after sending. Taxes or discounts are added in Stripe.</DialogDescription>
        <Table className="mt-3 w-full text-sm">
          <thead><tr><th>Line</th><th className="text-right">Amount</th></tr></thead>
          <tbody>{draft.lines.map((l, i) => (<tr key={i}><td>{l.description}</td><td className="text-right tabular-nums">{formatMoney(l.cents, draft.currency)}</td></tr>))}</tbody>
          <tfoot><tr className="border-t border-base-300 font-semibold"><td>Total</td><td className="text-right tabular-nums">{formatMoney(draft.totalCents, draft.currency)}</td></tr></tfoot>
        </Table>
        {sendBlocked && <p className="mt-3 text-sm text-secondary">{sendBlocked}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <DialogClose><Button type="button" variant="ghost" color="neutral">Close</Button></DialogClose>
          <Button size="sm" color="primary" loading={pending} disabled={Boolean(sendBlocked)} onClick={send}>Send statement</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Preview + Send before a statement exists; Open / Refresh / Void once one is out. */
export function StatementActions(p: Props) {
  const { run, pending } = useActionFeedback();
  const st = p.statement;
  if (st && st.status !== "void") {
    return (
      <span className="flex flex-wrap items-center justify-end gap-1.5">
        {st.hostedInvoiceUrl && <a href={st.hostedInvoiceUrl} target="_blank" rel="noreferrer" className="text-xs underline">Open invoice ↗</a>}
        <Button size="xs" variant="ghost" color="neutral" loading={pending} onClick={() => run(() => refreshStatement(p.organizationId, st.id))}>Refresh</Button>
        {st.status !== "paid" && <ConfirmDialog trigger={<Button size="xs" variant="ghost" color="neutral">Void</Button>} title="Void this statement?" description="The invoice is voided in Stripe and the month is open for a new statement. A paid invoice cannot be voided." confirmLabel="Void" onConfirm={() => run(() => voidStatement(p.organizationId, st.id))} />}
      </span>
    );
  }
  // The Statement column already carries the reason; repeating it here would say it twice on one row.
  if (!p.draft) return <span className="text-xs text-secondary/70" aria-label={p.blocked ?? "Nothing to bill"}>—</span>;
  return <PreviewDialog organizationId={p.organizationId} workspaceId={p.workspaceId} clientName={p.clientName} periodKey={p.periodKey} periodLabel={p.periodLabel} draft={p.draft} sendBlocked={p.sendBlocked} />;
}

/** The agency's Stripe link: connect, or show the account and let an admin disconnect. */
export function StripeConnection({ organizationId, configured, account }: { organizationId: string; configured: boolean; account: { id: string; livemode: boolean } | null }) {
  const { run, pending } = useActionFeedback();
  if (!configured) return <p className="text-xs text-secondary/70">Stripe Connect is not set up on this server, so statements cannot be sent from here.</p>;
  if (!account) return <a href={`/api/agency/stripe/start?org=${organizationId}`} className="btn btn-outline btn-sm">Connect your Stripe account</a>;
  return (
    <p className="flex items-center gap-2 text-xs text-secondary">
      <span aria-hidden="true">✓</span> Stripe connected · {account.id} · {account.livemode ? "live" : "test mode"}
      <ConfirmDialog trigger={<Button size="xs" variant="ghost" color="neutral" disabled={pending}>Disconnect</Button>} title="Disconnect Stripe?" description="RocketEase stops writing invoices to this account. Statements already sent stay in Stripe and here." confirmLabel="Disconnect" onConfirm={() => run(() => disconnectStripe(organizationId))} />
    </p>
  );
}
