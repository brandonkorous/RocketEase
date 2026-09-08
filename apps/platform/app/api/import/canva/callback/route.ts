import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { ProviderError } from "@rocketease/providers";
import { db } from "@/db";
import { importSource } from "@/db/schema/imports";
import { absoluteUrl } from "@/lib/app-url";
import { audit } from "@/lib/audit";
import { canvaAppConfig, canvaProfile, canvaUser, exchangeCanvaCode } from "@/lib/import/canva";
import { consumeImportState, importCallbackUrl } from "@/lib/import/oauth-state";
import { sealImportSecret } from "@/lib/import/sources";
import { log } from "@/lib/log";
import { workspacePath } from "@/lib/nav";
import { requireCapability, requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const library = (workspaceId: string) => workspacePath(workspaceId, "content");

/** Step 2: exchange the code with the PKCE verifier, name the account, seal the credential onto the row. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const session = await requireUser();
  const consumed = await consumeImportState(q.get("state") ?? "", "canva");
  if (!consumed) return NextResponse.redirect(absoluteUrl("/?error=import_state"));
  const { source, codeVerifier } = consumed;
  const back = (err?: string) => NextResponse.redirect(absoluteUrl(`${library(source.workspaceId)}${err ? `?error=${encodeURIComponent(err)}` : "?ok=canva_connected"}`));
  await requireCapability(source.workspaceId, "content.create");
  if (source.createdByUserId !== session.user.id) return back("This Canva connection was started by someone else.");

  if (q.get("error") || !q.get("code")) {
    await db.delete(importSource).where(eq(importSource.id, source.id));
    return back(q.get("error_description") ?? "Connecting Canva was cancelled.");
  }
  const cfg = canvaAppConfig();
  if (!cfg) return back("Canva import is not configured on this server.");

  try {
    const cred = await exchangeCanvaCode(cfg, q.get("code")!, codeVerifier, importCallbackUrl("canva"));
    const [profile, who] = await Promise.all([canvaProfile(cred.accessToken), canvaUser(cred.accessToken).catch(() => ({}) as { userId?: string; teamId?: string })]);
    await db
      .update(importSource)
      .set({ name: profile.displayName, scopes: cred.scopes, secret: sealImportSecret(source.id, cred), status: "healthy", health: { ok: true, lastCheckedAt: new Date().toISOString() }, config: { ...source.config, canvaUserId: who.userId, canvaTeamId: who.teamId }, lastError: null, updatedAt: new Date() })
      .where(eq(importSource.id, source.id));
    await audit({ action: "import.connected", actorUserId: session.user.id, organizationId: source.organizationId, workspaceId: source.workspaceId, targetType: "import_source", targetId: source.id, summary: { after: { kind: "canva", name: profile.displayName, scopes: cred.scopes } } });
    return back();
  } catch (err) {
    log.error("canva oauth callback failed", { sourceId: source.id, err });
    await db.delete(importSource).where(eq(importSource.id, source.id));
    await audit({ action: "import.connect_failed", actorUserId: session.user.id, organizationId: source.organizationId, workspaceId: source.workspaceId, targetType: "import_source", targetId: source.id, result: "error", summary: { note: err instanceof ProviderError ? err.category : "exchange_failed" } });
    return back(err instanceof ProviderError ? err.message : "Could not finish connecting Canva.");
  }
}
