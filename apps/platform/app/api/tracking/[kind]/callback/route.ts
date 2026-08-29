import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { ProviderError } from "@rocketease/providers";
import { db } from "@/db";
import { trackingSource, type TrackingSource } from "@/db/schema/tracking";
import { audit } from "@/lib/audit";
import { enqueue } from "@/lib/jobs/boss";
import { log } from "@/lib/log";
import { workspacePath } from "@/lib/nav";
import { requireCapability, requireUser } from "@/lib/session";
import { exchangeGa4Code, fetchGa4Property } from "@/lib/tracking/ga4";
import { windowLabel } from "@/lib/tracking/labels";
import { consumeTrackingState, trackingCallbackUrl } from "@/lib/tracking/oauth-state";
import { exchangeShopifyCode, verifyShopifyCallback } from "@/lib/tracking/shopify";
import { ga4AppConfig, sealTrackingSecret, shopifyAppConfig, type TrackingCredential } from "@/lib/tracking/sources";

export const dynamic = "force-dynamic";

const settings = (workspaceId: string) => workspacePath(workspaceId, "settings/tracking");
const isOAuthKind = (k: string): k is "ga4" | "shopify" => k === "ga4" || k === "shopify";

type Activation = { cred: TrackingCredential; scopes: string[]; name: string; currency?: string };

async function activateGa4(source: TrackingSource, code: string): Promise<Activation> {
  const cfg = ga4AppConfig();
  if (!cfg) throw new ProviderError("Google Analytics is not configured.", { category: "permission" });
  const cred = await exchangeGa4Code(cfg, code, trackingCallbackUrl("ga4"));
  const property = await fetchGa4Property(cred.accessToken, source.config.propertyId ?? "");
  return { cred: { kind: "ga4", ...cred }, scopes: cred.scopes, name: property.displayName, currency: property.currency };
}

async function activateShopify(source: TrackingSource, code: string, q: URLSearchParams): Promise<Activation> {
  const cfg = shopifyAppConfig();
  if (!cfg) throw new ProviderError("Shopify is not configured.", { category: "permission" });
  const shop = source.config.shopDomain ?? "";
  if (q.get("shop") !== shop) throw new ProviderError("The shop in the callback does not match the one you started from.", { category: "permission" });
  if (!verifyShopifyCallback(Object.fromEntries(q.entries()), cfg.clientSecret)) throw new ProviderError("Shopify's callback signature did not verify.", { category: "permission" });
  const { accessToken, scopes } = await exchangeShopifyCode(shop, cfg, code);
  return { cred: { kind: "shopify", accessToken, scopes }, scopes, name: shop };
}

/** Step 2: exchange the code, seal the credential onto the pending row, start the first import. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const q = req.nextUrl.searchParams;
  const session = await requireUser();
  if (!isOAuthKind(kind)) return NextResponse.json({ error: "Unknown tracking source" }, { status: 404 });

  const source = await consumeTrackingState(q.get("state") ?? "", kind);
  if (!source) return NextResponse.redirect(new URL("/?error=tracking_state", req.url));
  const back = (err?: string) => NextResponse.redirect(new URL(`${settings(source.workspaceId)}${err ? `?error=${encodeURIComponent(err)}` : "?ok=tracking_connected"}`, req.url));
  await requireCapability(source.workspaceId, "workspace.settings");

  if (q.get("error") || !q.get("code")) {
    await db.delete(trackingSource).where(eq(trackingSource.id, source.id));
    return back(q.get("error_description") ?? "Connecting the tracking source was cancelled.");
  }

  try {
    const a = kind === "ga4" ? await activateGa4(source, q.get("code")!) : await activateShopify(source, q.get("code")!, q);
    await db
      .update(trackingSource)
      .set({
        name: a.name,
        scopes: a.scopes,
        secret: sealTrackingSecret(source.id, a.cred),
        status: "healthy",
        health: { ok: true, lastCheckedAt: new Date().toISOString() },
        config: { ...source.config, currency: a.currency ?? source.config.currency, windowLabel: windowLabel(kind) },
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(trackingSource.id, source.id));
    await enqueue("tracking.sync", { sourceId: source.id }, { singletonKey: `tracking.sync:${source.id}`, singletonSeconds: 60 });
    await audit({ action: "tracking.connected", actorUserId: session.user.id, organizationId: source.organizationId, workspaceId: source.workspaceId, targetType: "tracking_source", targetId: source.id, summary: { after: { kind, name: a.name, scopes: a.scopes } } });
    return back();
  } catch (err) {
    log.error("tracking oauth callback failed", { kind, sourceId: source.id, err });
    await db.delete(trackingSource).where(eq(trackingSource.id, source.id));
    await audit({ action: "tracking.connect_failed", actorUserId: session.user.id, organizationId: source.organizationId, workspaceId: source.workspaceId, targetType: "tracking_source", targetId: source.id, result: "error", summary: { note: err instanceof ProviderError ? err.category : "exchange_failed" } });
    return back(err instanceof ProviderError ? err.message : "Could not finish connecting the tracking source.");
  }
}
