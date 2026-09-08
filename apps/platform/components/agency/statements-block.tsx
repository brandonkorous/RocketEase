import { Table } from "@wizeworks/silicaui-react";
import type { AgencyPeriod, Client } from "@/lib/agency/margin-queries";
import { formatMoney, type ClientRate, type MarginInput } from "@/lib/agency/margin";
import { NO_BILLING_EMAIL, NO_STRIPE, STATEMENT_STATUS_LABEL, buildStatement, type StatementStatus } from "@/lib/agency/statement";
import { billingAccountFor, statementsFor } from "@/lib/agency/statement-queries";
import { connectConfigured } from "@/lib/agency/stripe-connect";
import { StatementActions, StripeConnection, type StatementCell } from "./statement-actions";

type Props = { organizationId: string; clients: Client[]; inputs: MarginInput[]; rates: Map<string, ClientRate>; period: AgencyPeriod };

/** Status is a glyph and a label, never colour alone. */
const GLYPH: Record<StatementStatus, string> = { draft: "○", sent: "→", paid: "✓", void: "⊘", uncollectible: "⚠" };

const summary = (lines: { kind: string }[]) => {
  const kinds = new Set(lines.map((l) => l.kind));
  return [kinds.has("fee") ? "Fee" : null, kinds.has("ad_spend") ? "ad spend" : null, kinds.has("ai") ? "AI" : null].filter(Boolean).join(" + ");
};

/**
 * Each client's statement for the month (M14.10): what would be invoiced, or
 * why nothing can be, and what happened to the one already sent. The invoice
 * leaves from the agency's own Stripe account, never from RocketEase's.
 */
export async function StatementsBlock({ organizationId, clients, inputs, rates, period }: Props) {
  const configured = connectConfigured();
  const [account, statements] = await Promise.all([billingAccountFor(organizationId), statementsFor(organizationId, clients.map((c) => c.id), period.month)]);
  const stripeBlocked = !configured ? "Stripe Connect is not set up on this server." : !account?.stripeAccountId ? NO_STRIPE : null;
  return (
    <div className="mt-6 border-t border-base-300 pt-4" aria-labelledby={`statements-${organizationId}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id={`statements-${organizationId}`} className="text-sm font-semibold">Statements</h3>
          <p className="mt-1 max-w-160 text-sm text-secondary">Each client&rsquo;s charges for {period.label} — the fee, and ad spend or AI where the rate rebills them — sent as an invoice from your own Stripe account, due 30 days later. RocketEase never handles the money.</p>
        </div>
        <StripeConnection organizationId={organizationId} configured={configured} account={account?.stripeAccountId ? { id: account.stripeAccountId, livemode: account.livemode } : null} />
      </div>
      <div className="mt-3 overflow-x-auto">
        <Table className="w-full text-sm">
          <thead><tr><th>Client</th><th>Statement</th><th className="text-right">Total</th><th>Status</th><th className="text-right">Actions</th></tr></thead>
          <tbody>
            {clients.map((c) => {
              const input = inputs.find((i) => i.workspaceId === c.id);
              const built = input ? buildStatement(input, period.label) : ({ ok: false, blocked: "No data for this client." } as const);
              const st = statements.get(c.id);
              const cell: StatementCell = st ? { id: st.id, status: st.status, hostedInvoiceUrl: st.hostedInvoiceUrl, number: st.stripeInvoiceNumber } : null;
              const live = st && st.status !== "void" ? st : null;
              const email = rates.get(c.id)?.billingEmail ?? null;
              const sendBlocked = stripeBlocked ?? (email ? null : NO_BILLING_EMAIL);
              return (
                <tr key={c.id}>
                  <td className="font-medium">{c.name}</td>
                  <td className="text-secondary">{live ? `${summary(live.lines)}${live.stripeInvoiceNumber ? ` · ${live.stripeInvoiceNumber}` : ""}` : built.ok ? summary(built.draft.lines) : <span className="text-secondary/70">{built.blocked}</span>}</td>
                  <td className="text-right tabular-nums">{live ? formatMoney(live.totalCents, live.currency) : built.ok ? formatMoney(built.draft.totalCents, built.draft.currency) : "—"}</td>
                  <td><span aria-hidden="true">{GLYPH[live?.status ?? "draft"]}</span> {STATEMENT_STATUS_LABEL[live?.status ?? "draft"]}{live?.status === "sent" && email ? <span className="text-xs text-secondary/70"> · to {email}</span> : null}</td>
                  <td className="text-right"><StatementActions organizationId={organizationId} workspaceId={c.id} clientName={c.name} periodKey={period.key} periodLabel={period.label} draft={built.ok ? built.draft : null} blocked={built.ok ? null : built.blocked} sendBlocked={sendBlocked} statement={cell} /></td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </div>
    </div>
  );
}
