/*
 * Stripe Connect webhook: events from the agencies' connected accounts.
 * Signed with STRIPE_CONNECT_WEBHOOK_SECRET (a separate endpoint in the Stripe
 * dashboard, "Events on connected accounts"); public in middleware like the
 * platform webhook. Applied exactly once through the same claim table.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agencyBillingAccount, clientStatement } from "@/db/schema/agency";
import { applyConnectEvent, type StatementStore } from "@/lib/agency/statement-webhook";
import { audit } from "@/lib/audit";
import { billingConfigured, stripe } from "@/lib/billing/stripe";
import { store as claims } from "@/lib/billing/webhook-live";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const store: StatementStore = {
  async byInvoice(stripeInvoiceId) {
    const st = await db.query.clientStatement.findFirst({ where: (s, { eq }) => eq(s.stripeInvoiceId, stripeInvoiceId) });
    if (!st) return null;
    const account = await db.query.agencyBillingAccount.findFirst({ where: (a, { eq }) => eq(a.organizationId, st.organizationId) });
    return { id: st.id, organizationId: st.organizationId, workspaceId: st.workspaceId, status: st.status, accountId: account?.stripeAccountId ?? null };
  },
  async setStatus(id, status, extra) {
    await db.update(clientStatement).set({ status, hostedInvoiceUrl: extra.hostedInvoiceUrl ?? undefined, stripeInvoiceNumber: extra.number ?? undefined, paidAt: extra.paidAt ?? undefined, voidedAt: extra.voidedAt ?? undefined, updatedAt: new Date() }).where(eq(clientStatement.id, id));
  },
  async record(action, organizationId, workspaceId, target, summary) {
    await audit({ action, organizationId, workspaceId, targetType: target.type, targetId: target.id, summary: summary ? { after: summary } : undefined });
  },
};

export async function POST(req: Request) {
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!billingConfigured() || !secret) return new NextResponse("connect billing not configured", { status: 503 });
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new NextResponse("missing signature", { status: 400 });
  const rawBody = await req.text();
  let event;
  try {
    event = await stripe().webhooks.constructEventAsync(rawBody, signature, secret);
  } catch {
    return new NextResponse("bad signature", { status: 400 });
  }
  try {
    if ((await claims.claim(event)) === "duplicate") return NextResponse.json({ received: true, duplicate: true });
    const result = await applyConnectEvent(event, store);
    await claims.markProcessed(event.id);
    return NextResponse.json({ received: true, ...result });
  } catch (err) {
    log.error("stripe connect webhook failed", { type: event.type, id: event.id, err });
    return new NextResponse("handler failed", { status: 500 });
  }
}
