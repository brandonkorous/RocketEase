/*
 * Connect webhook for client statements (M14.10). Stripe sends events that
 * happened on connected accounts to a separate endpoint, each stamped with
 * the account (`event.account`). An invoice event updates the statement that
 * carries that invoice, and only if the account matches the organization's
 * connected account — an event about someone else's invoice changes nothing.
 * Pure apply over a store, like lib/billing/webhook.ts.
 */
import type Stripe from "stripe";
import { statusFromInvoice, type StatementStatus } from "./statement";

export const CONNECT_EVENTS = ["invoice.paid", "invoice.payment_failed", "invoice.voided", "invoice.marked_uncollectible", "invoice.finalized"] as const;
export type ConnectEvent = (typeof CONNECT_EVENTS)[number];
export const isConnectEvent = (type: string): type is ConnectEvent => (CONNECT_EVENTS as readonly string[]).includes(type);

export type StatementRef = { id: string; organizationId: string; workspaceId: string; status: StatementStatus; accountId: string | null };
export type StatementStore = {
  byInvoice(stripeInvoiceId: string): Promise<StatementRef | null>;
  setStatus(id: string, status: StatementStatus, extra: { hostedInvoiceUrl?: string | null; number?: string | null; paidAt?: Date | null; voidedAt?: Date | null }): Promise<void>;
  record(action: string, organizationId: string, workspaceId: string, target: { type: string; id: string }, summary?: Record<string, unknown>): Promise<void>;
};

export type ConnectResult = { applied: boolean; reason?: string; status?: StatementStatus };

export async function applyConnectEvent(event: Stripe.Event, store: StatementStore): Promise<ConnectResult> {
  if (!isConnectEvent(event.type)) return { applied: false, reason: "not a statement event" };
  const invoice = event.data.object as Stripe.Invoice;
  if (!invoice?.id) return { applied: false, reason: "no invoice on the event" };
  const st = await store.byInvoice(invoice.id);
  if (!st) return { applied: false, reason: "no statement carries this invoice" };
  if (!event.account || st.accountId !== event.account) return { applied: false, reason: "the event's account is not this organization's" };
  const status = statusFromInvoice(invoice.status);
  const now = new Date(event.created * 1000);
  await store.setStatus(st.id, status, { hostedInvoiceUrl: invoice.hosted_invoice_url ?? null, number: invoice.number ?? null, paidAt: status === "paid" ? now : null, voidedAt: status === "void" ? now : null });
  await store.record(`agency.statement.${event.type.replace("invoice.", "")}`, st.organizationId, st.workspaceId, { type: "client_statement", id: st.id }, { status, invoice: invoice.id });
  return { applied: true, status };
}
