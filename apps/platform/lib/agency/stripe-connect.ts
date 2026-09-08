/*
 * Stripe Connect for agencies (M14.10). The agency connects its OWN Stripe
 * account (a Standard account, OAuth `read_write`); RocketEase then creates
 * the customer and the invoice on that account with the Stripe-Account header,
 * so the money moves agency ↔ client and never through us: no application fee,
 * no destination charge, nothing on our balance.
 * Sources (2026-09-06): docs.stripe.com/connect/oauth-reference (authorize,
 * token, deauthorize), connect/authentication (Stripe-Account header),
 * invoicing/integration (customer → invoice → items → send; send finalizes).
 * Worker-safe.
 */
import type Stripe from "stripe";
import { appUrl } from "@/lib/app-url";
import { stripe } from "@/lib/billing/stripe";

export const connectClientId = () => process.env.STRIPE_CONNECT_CLIENT_ID ?? null;
/** Statements need our platform key AND a Connect client id; without either the section says so. */
export const connectConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY && connectClientId());
export const connectCallbackUrl = () => `${appUrl()}/api/agency/stripe/callback`;

export function connectAuthorizeUrl(state: string, prefill: { email?: string | null; businessName?: string | null }) {
  return stripe().oauth.authorizeUrl({ client_id: connectClientId()!, response_type: "code", scope: "read_write", redirect_uri: connectCallbackUrl(), state, stripe_user: { email: prefill.email ?? undefined, business_name: prefill.businessName ?? undefined } });
}

/** The authorization code is single-use: consuming it twice revokes the connection (OAuth reference). */
export async function exchangeConnectCode(code: string): Promise<{ accountId: string; livemode: boolean; scope: string }> {
  const r = await stripe().oauth.token({ grant_type: "authorization_code", code });
  if (!r.stripe_user_id) throw new Error("Stripe returned no account id.");
  return { accountId: r.stripe_user_id, livemode: Boolean(r.livemode), scope: r.scope ?? "read_write" };
}

export const deauthorizeConnect = (accountId: string) => stripe().oauth.deauthorize({ client_id: connectClientId()!, stripe_user_id: accountId });

/** Every call on the agency's account carries this; nothing here ever touches our own account's objects. */
const on = (accountId: string): Stripe.RequestOptions => ({ stripeAccount: accountId });

export async function ensureClientCustomer(accountId: string, existing: string | null, client: { name: string; email: string }): Promise<string> {
  if (existing) return existing;
  const c = await stripe().customers.create({ name: client.name, email: client.email, description: "RocketEase client workspace" }, on(accountId));
  return c.id;
}

/** `cents` is the line total; the quantity and unit are already in the description (Stripe's `amount` is a total). */
export type InvoiceLine = { description: string; cents: number };
export type SentInvoice = { invoiceId: string; number: string | null; status: string | null; hostedInvoiceUrl: string | null };

/**
 * Draft invoice → items → send. Sending finalizes it and Stripe emails the
 * customer; `auto_advance: false` keeps Stripe from finalizing on its own
 * before the items are on it.
 */
export async function sendClientInvoice(accountId: string, input: { customerId: string; currency: string; lines: InvoiceLine[]; daysUntilDue: number; description: string; metadata: Record<string, string> }): Promise<SentInvoice> {
  const s = stripe();
  const currency = input.currency.toLowerCase();
  const invoice = await s.invoices.create({ customer: input.customerId, collection_method: "send_invoice", days_until_due: input.daysUntilDue, currency, description: input.description, auto_advance: false, metadata: input.metadata }, on(accountId));
  for (const line of input.lines) {
    await s.invoiceItems.create({ customer: input.customerId, invoice: invoice.id, currency, description: line.description, amount: line.cents }, on(accountId));
  }
  const sent = await s.invoices.sendInvoice(invoice.id, {}, on(accountId));
  return { invoiceId: sent.id, number: sent.number ?? null, status: sent.status ?? null, hostedInvoiceUrl: sent.hosted_invoice_url ?? null };
}

export async function voidClientInvoice(accountId: string, invoiceId: string): Promise<{ status: string | null }> {
  const v = await stripe().invoices.voidInvoice(invoiceId, {}, on(accountId));
  return { status: v.status ?? null };
}

/** Re-read one invoice from the agency's account (reconciliation after a lost webhook). */
export async function readClientInvoice(accountId: string, invoiceId: string): Promise<{ status: string | null; hostedInvoiceUrl: string | null; number: string | null }> {
  const i = await stripe().invoices.retrieve(invoiceId, {}, on(accountId));
  return { status: i.status ?? null, hostedInvoiceUrl: i.hosted_invoice_url ?? null, number: i.number ?? null };
}
