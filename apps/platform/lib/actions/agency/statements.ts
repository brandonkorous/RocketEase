"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agencyBillingAccount, clientRate, clientStatement } from "@/db/schema/agency";
import { workspace } from "@/db/schema/app";
import { agencyPeriod, marginInputs } from "@/lib/agency/margin-queries";
import { ALREADY_SENT, NO_BILLING_EMAIL, NO_STRIPE, buildStatement, statusFromInvoice, type StatementDraft } from "@/lib/agency/statement";
import { billingAccountFor, statementsFor } from "@/lib/agency/statement-queries";
import { deauthorizeConnect, ensureClientCustomer, readClientInvoice, sendClientInvoice, voidClientInvoice } from "@/lib/agency/stripe-connect";
import { audit } from "@/lib/audit";
import { fail, guard, type ActionState } from "@/lib/actions/content/shared";
import { requireOrgAdmin } from "./shared";

const DAYS_UNTIL_DUE = 30;

async function clientOf(organizationId: string, workspaceId: string) {
  const [ws] = await db.select({ id: workspace.id, name: workspace.name, timezone: workspace.timezone }).from(workspace).where(eq(workspace.id, workspaceId));
  return ws && (await db.query.workspace.findFirst({ where: (w, { and, eq }) => and(eq(w.id, workspaceId), eq(w.organizationId, organizationId)) })) ? ws : null;
}

/** The month's lines for one client, or why there are none. Owners and admins only. */
export async function previewStatement(organizationId: string, workspaceId: string, periodKey: string): Promise<ActionState & { draft?: StatementDraft; blocked?: string; period?: string; periodLabel?: string }> {
  return guard(async () => {
    await requireOrgAdmin(organizationId);
    const client = await clientOf(organizationId, workspaceId);
    if (!client) return fail("That client isn't in this organization.");
    const period = agencyPeriod(periodKey, client.timezone);
    const [input] = await marginInputs({ organizationId, clients: [{ id: client.id, name: client.name }], period, timezone: client.timezone });
    const b = buildStatement(input, period.label);
    return b.ok ? { ok: "", draft: b.draft, period: period.month, periodLabel: period.label } : { ok: "", blocked: b.blocked, period: period.month, periodLabel: period.label };
  });
}

/**
 * Send the month's statement as an invoice from the agency's own Stripe
 * account. One live statement per client per month; a void one frees it.
 */
export async function sendStatement(organizationId: string, workspaceId: string, periodKey: string): Promise<ActionState & { hostedInvoiceUrl?: string | null }> {
  return guard(async () => {
    const ctx = await requireOrgAdmin(organizationId);
    const account = await billingAccountFor(organizationId);
    if (!account?.stripeAccountId) return fail(NO_STRIPE);
    const client = await clientOf(organizationId, workspaceId);
    if (!client) return fail("That client isn't in this organization.");
    const rate = await db.query.clientRate.findFirst({ where: (r, { eq }) => eq(r.workspaceId, workspaceId) });
    if (!rate?.billingEmail) return fail(NO_BILLING_EMAIL);
    const period = agencyPeriod(periodKey, client.timezone);
    const existing = (await statementsFor(organizationId, [workspaceId], period.month)).get(workspaceId);
    if (existing && existing.status !== "void") return fail(ALREADY_SENT);
    const [input] = await marginInputs({ organizationId, clients: [{ id: client.id, name: client.name }], period, timezone: client.timezone });
    const b = buildStatement(input, period.label);
    if (!b.ok) return fail(b.blocked);

    const customerId = await ensureClientCustomer(account.stripeAccountId, rate.stripeCustomerId, { name: rate.billingName?.trim() || client.name, email: rate.billingEmail });
    if (customerId !== rate.stripeCustomerId) await db.update(clientRate).set({ stripeCustomerId: customerId, updatedAt: new Date() }).where(eq(clientRate.id, rate.id));
    const [row] = await db.insert(clientStatement).values({ organizationId, workspaceId, period: period.month, currency: b.draft.currency, lines: b.draft.lines, totalCents: b.draft.totalCents, status: "draft", billingEmail: rate.billingEmail, daysUntilDue: DAYS_UNTIL_DUE, createdByUserId: ctx.userId }).returning({ id: clientStatement.id });
    try {
      const sent = await sendClientInvoice(account.stripeAccountId, { customerId, currency: b.draft.currency, lines: b.draft.lines, daysUntilDue: DAYS_UNTIL_DUE, description: `${client.name} — ${period.label}`, metadata: { rocketease_statement_id: row.id, rocketease_workspace_id: workspaceId, period: period.month } });
      await db.update(clientStatement).set({ status: statusFromInvoice(sent.status), stripeInvoiceId: sent.invoiceId, stripeInvoiceNumber: sent.number, hostedInvoiceUrl: sent.hostedInvoiceUrl, sentAt: new Date(), updatedAt: new Date() }).where(eq(clientStatement.id, row.id));
      await audit({ action: "agency.statement.send", actorUserId: ctx.userId, organizationId, workspaceId, targetType: "client_statement", targetId: row.id, summary: { after: { period: period.month, totalCents: b.draft.totalCents, currency: b.draft.currency, invoice: sent.invoiceId, to: rate.billingEmail } } });
      revalidatePath("/agency");
      return { ok: `Statement for ${period.label} sent to ${rate.billingEmail}.`, hostedInvoiceUrl: sent.hostedInvoiceUrl };
    } catch (e) {
      // Stripe refused or never answered: the row says so and stays a draft, so nothing looks sent that is not.
      const message = e instanceof Error ? e.message : "Stripe could not be reached.";
      await db.update(clientStatement).set({ status: "void", voidedAt: new Date(), updatedAt: new Date() }).where(eq(clientStatement.id, row.id));
      await audit({ action: "agency.statement.send_failed", actorUserId: ctx.userId, organizationId, workspaceId, targetType: "client_statement", targetId: row.id, result: "error", summary: { note: message } });
      return fail(`The statement was not sent: ${message}`);
    }
  });
}

/** Void the sent invoice at Stripe; the month is open for a new statement afterwards. */
export async function voidStatement(organizationId: string, statementId: string): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireOrgAdmin(organizationId);
    const account = await billingAccountFor(organizationId);
    const st = await db.query.clientStatement.findFirst({ where: (s, { and, eq }) => and(eq(s.id, statementId), eq(s.organizationId, organizationId)) });
    if (!st || !st.stripeInvoiceId || !account?.stripeAccountId) return fail("That statement has no invoice to void.");
    if (st.status === "paid") return fail("A paid invoice cannot be voided; refund it in Stripe instead.");
    const v = await voidClientInvoice(account.stripeAccountId, st.stripeInvoiceId);
    await db.update(clientStatement).set({ status: statusFromInvoice(v.status), voidedAt: new Date(), updatedAt: new Date() }).where(eq(clientStatement.id, st.id));
    await audit({ action: "agency.statement.void", actorUserId: ctx.userId, organizationId, workspaceId: st.workspaceId, targetType: "client_statement", targetId: st.id, summary: { before: { status: st.status }, after: { status: statusFromInvoice(v.status) } } });
    revalidatePath("/agency");
    return { ok: "Statement voided." };
  });
}

/** Re-read the invoice from Stripe when a webhook was missed. */
export async function refreshStatement(organizationId: string, statementId: string): Promise<ActionState> {
  return guard(async () => {
    await requireOrgAdmin(organizationId);
    const account = await billingAccountFor(organizationId);
    const st = await db.query.clientStatement.findFirst({ where: (s, { and, eq }) => and(eq(s.id, statementId), eq(s.organizationId, organizationId)) });
    if (!st?.stripeInvoiceId || !account?.stripeAccountId) return fail("That statement has no invoice.");
    const i = await readClientInvoice(account.stripeAccountId, st.stripeInvoiceId);
    const status = statusFromInvoice(i.status);
    await db.update(clientStatement).set({ status, hostedInvoiceUrl: i.hostedInvoiceUrl ?? st.hostedInvoiceUrl, stripeInvoiceNumber: i.number ?? st.stripeInvoiceNumber, paidAt: status === "paid" ? (st.paidAt ?? new Date()) : st.paidAt, updatedAt: new Date() }).where(eq(clientStatement.id, st.id));
    revalidatePath("/agency");
    return { ok: `Invoice is ${status}.` };
  });
}

/** Forget the agency's Stripe link (and tell Stripe). Sent statements stay as records. */
export async function disconnectStripe(organizationId: string): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireOrgAdmin(organizationId);
    const account = await billingAccountFor(organizationId);
    if (!account?.stripeAccountId) return fail("Stripe is not connected.");
    await deauthorizeConnect(account.stripeAccountId).catch(() => undefined);
    await db.update(agencyBillingAccount).set({ status: "disconnected", disconnectedAt: new Date(), updatedAt: new Date() }).where(eq(agencyBillingAccount.id, account.id));
    await audit({ action: "agency.stripe.disconnected", actorUserId: ctx.userId, organizationId, targetType: "agency_billing_account", targetId: account.id, summary: { before: { account: account.stripeAccountId } } });
    revalidatePath("/agency");
    return { ok: "Stripe disconnected." };
  });
}
