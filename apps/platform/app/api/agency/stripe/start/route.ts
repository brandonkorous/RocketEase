import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agencyBillingAccount } from "@/db/schema/agency";
import { organization } from "@/db/schema/auth";
import { requireOrgAdmin } from "@/lib/actions/agency/shared";
import { connectAuthorizeUrl, connectConfigured } from "@/lib/agency/stripe-connect";
import { absoluteUrl } from "@/lib/app-url";
import { audit } from "@/lib/audit";
import { AuthorizationError } from "@/lib/authz";

export const dynamic = "force-dynamic";
const STATE_TTL_MS = 10 * 60_000;

/**
 * Step 1 of connecting the agency's Stripe account: one pending row per
 * organization with a single-use nonce, then Stripe's Connect consent screen.
 * Owners and admins of the organization only.
 */
export async function GET(req: NextRequest) {
  const organizationId = req.nextUrl.searchParams.get("org") ?? "";
  const back = (err?: string) => NextResponse.redirect(absoluteUrl(`/agency${err ? `?error=${encodeURIComponent(err)}` : ""}`));
  if (!connectConfigured()) return back("Stripe Connect is not configured on this server.");
  try {
    const ctx = await requireOrgAdmin(organizationId);
    const nonce = randomBytes(24).toString("base64url");
    const config = { oauthNonce: nonce, oauthExpiresAt: new Date(Date.now() + STATE_TTL_MS).toISOString() };
    const [row] = await db
      .insert(agencyBillingAccount)
      .values({ organizationId, status: "connecting", config, connectedByUserId: ctx.userId })
      .onConflictDoUpdate({ target: agencyBillingAccount.organizationId, set: { status: "connecting", config, connectedByUserId: ctx.userId, updatedAt: new Date() } })
      .returning({ id: agencyBillingAccount.id });
    const [org] = await db.select({ name: organization.name }).from(organization).where(eq(organization.id, organizationId));
    await audit({ action: "agency.stripe.connect_start", actorUserId: ctx.userId, organizationId, targetType: "agency_billing_account", targetId: row.id });
    return NextResponse.redirect(connectAuthorizeUrl(`${row.id}.${nonce}`, { businessName: org?.name }));
  } catch (e) {
    if (e instanceof AuthorizationError) return back("Only an owner or admin of the organization can connect Stripe.");
    throw e;
  }
}
