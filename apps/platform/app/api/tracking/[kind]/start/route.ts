import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { trackingSource, TRACKING_KINDS, type TrackingKind } from "@/db/schema/tracking";
import { audit } from "@/lib/audit";
import { AuthorizationError } from "@/lib/authz";
import { workspacePath } from "@/lib/nav";
import { requireCapability } from "@/lib/session";
import { ga4AuthorizeUrl } from "@/lib/tracking/ga4";
import { KIND_LABEL } from "@/lib/tracking/labels";
import { createTrackingState, trackingCallbackUrl } from "@/lib/tracking/oauth-state";
import { normalizeShopDomain, shopifyAuthorizeUrl } from "@/lib/tracking/shopify";
import { ga4AppConfig, shopifyAppConfig } from "@/lib/tracking/sources";

export const dynamic = "force-dynamic";

const PROPERTY_RE = /^\d{6,20}$/;
const settings = (workspaceId: string) => workspacePath(workspaceId, "settings/tracking");
const isOAuthKind = (k: string): k is "ga4" | "shopify" => k === "ga4" || k === "shopify";

/** The row exists before consent so the OAuth state has something single-use to hang on. */
async function createPending(kind: TrackingKind, ctx: { organizationId: string; workspaceId: string; userId: string }, name: string, config: Record<string, string>) {
  const [row] = await db
    .insert(trackingSource)
    .values({ organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, kind, name, status: "connecting", config, createdByUserId: ctx.userId })
    .returning();
  return row;
}

/**
 * Step 1 of connecting a conversion source: validate what the user typed,
 * create the pending row, then hand off to the vendor's consent screen.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const q = req.nextUrl.searchParams;
  const workspaceId = q.get("workspaceId") ?? "";
  if (!(TRACKING_KINDS as readonly string[]).includes(kind) || !isOAuthKind(kind)) return NextResponse.json({ error: "Unknown tracking source" }, { status: 404 });
  const back = (err?: string) => NextResponse.redirect(new URL(`${settings(workspaceId)}${err ? `?error=${encodeURIComponent(err)}` : ""}`, req.url));

  try {
    const ctx = await requireCapability(workspaceId, "workspace.settings");
    const who = { organizationId: ctx.workspace.organizationId, workspaceId, userId: ctx.session.user.id };
    const url = kind === "ga4" ? await startGa4(q, who) : await startShopify(q, who);
    if (typeof url !== "string") return back(url.error);
    await audit({ action: "tracking.connect_start", actorUserId: ctx.session.user.id, organizationId: who.organizationId, workspaceId, targetType: "tracking_source", targetId: kind, summary: { after: { kind: KIND_LABEL[kind] } } });
    return NextResponse.redirect(url);
  } catch (e) {
    if (e instanceof AuthorizationError) return back("You do not have permission to change tracking settings.");
    throw e;
  }
}

type Who = { organizationId: string; workspaceId: string; userId: string };

async function startGa4(q: URLSearchParams, who: Who): Promise<string | { error: string }> {
  const cfg = ga4AppConfig();
  if (!cfg) return { error: "Google Analytics is not configured in this deployment." };
  const propertyId = (q.get("propertyId") ?? "").trim();
  if (!PROPERTY_RE.test(propertyId)) return { error: "Enter the numeric GA4 property id, for example 401234567." };
  const row = await createPending("ga4", who, `GA4 property ${propertyId}`, { propertyId });
  return ga4AuthorizeUrl(cfg.clientId, trackingCallbackUrl("ga4"), await createTrackingState(row));
}

async function startShopify(q: URLSearchParams, who: Who): Promise<string | { error: string }> {
  const cfg = shopifyAppConfig();
  if (!cfg) return { error: "Shopify is not configured in this deployment." };
  const shop = normalizeShopDomain(q.get("shop") ?? "");
  if (!shop) return { error: "Enter your myshopify.com domain, for example acme.myshopify.com." };
  const row = await createPending("shopify", who, shop, { shopDomain: shop });
  return shopifyAuthorizeUrl(shop, cfg.clientId, trackingCallbackUrl("shopify"), await createTrackingState(row));
}
