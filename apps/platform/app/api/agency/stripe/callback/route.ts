import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { agencyBillingAccount } from "@/db/schema/agency";
import { requireOrgAdmin } from "@/lib/actions/agency/shared";
import { connectConfigured, exchangeConnectCode } from "@/lib/agency/stripe-connect";
import { absoluteUrl } from "@/lib/app-url";
import { audit } from "@/lib/audit";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

const equal = (a: string, b: string) => { const x = Buffer.from(a); const y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

/** Validate + consume the single-use state; returns the pending row or null. */
async function consume(state: string) {
  const [id, nonce] = state.split(".");
  if (!id || !nonce) return null;
  const row = await db.query.agencyBillingAccount.findFirst({ where: (a, { eq }) => eq(a.id, id) });
  if (!row || !row.config.oauthNonce || !equal(row.config.oauthNonce, nonce)) return null;
  if (!row.config.oauthExpiresAt || Date.parse(row.config.oauthExpiresAt) < Date.now()) return null;
  const cleared = await db.update(agencyBillingAccount).set({ config: {}, updatedAt: new Date() }).where(and(eq(agencyBillingAccount.id, id), sql`${agencyBillingAccount.config}->>'oauthNonce' = ${nonce}`)).returning({ id: agencyBillingAccount.id });
  return cleared.length ? row : null;
}

/** Step 2: the code becomes the connected account id (acct_…); nothing else is stored — every later call carries the Stripe-Account header. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const row = await consume(q.get("state") ?? "");
  if (!row) return NextResponse.redirect(absoluteUrl("/agency?error=stripe_state"));
  const back = (err?: string) => NextResponse.redirect(absoluteUrl(`/agency${err ? `?error=${encodeURIComponent(err)}` : "?ok=stripe_connected"}`));
  const ctx = await requireOrgAdmin(row.organizationId);
  if (q.get("error") || !q.get("code")) {
    await db.update(agencyBillingAccount).set({ status: "disconnected", updatedAt: new Date() }).where(eq(agencyBillingAccount.id, row.id));
    return back(q.get("error_description") ?? "Connecting Stripe was cancelled.");
  }
  if (!connectConfigured()) return back("Stripe Connect is not configured on this server.");
  try {
    const a = await exchangeConnectCode(q.get("code")!);
    await db.update(agencyBillingAccount).set({ stripeAccountId: a.accountId, livemode: a.livemode, scope: a.scope, status: "connected", disconnectedAt: null, updatedAt: new Date() }).where(eq(agencyBillingAccount.id, row.id));
    await audit({ action: "agency.stripe.connected", actorUserId: ctx.userId, organizationId: row.organizationId, targetType: "agency_billing_account", targetId: row.id, summary: { after: { account: a.accountId, livemode: a.livemode, scope: a.scope } } });
    return back();
  } catch (err) {
    log.error("stripe connect callback failed", { organizationId: row.organizationId, err });
    await db.update(agencyBillingAccount).set({ status: "disconnected", updatedAt: new Date() }).where(eq(agencyBillingAccount.id, row.id));
    return back(err instanceof Error ? err.message : "Could not finish connecting Stripe.");
  }
}
