import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { importSource } from "@/db/schema/imports";
import { absoluteUrl } from "@/lib/app-url";
import { audit } from "@/lib/audit";
import { AuthorizationError } from "@/lib/authz";
import { canvaAppConfig, canvaAuthorizeUrl, pkcePair } from "@/lib/import/canva";
import { createImportState, importCallbackUrl } from "@/lib/import/oauth-state";
import { clearPendingSources } from "@/lib/import/sources";
import { workspacePath } from "@/lib/nav";
import { requireCapability } from "@/lib/session";

export const dynamic = "force-dynamic";

const library = (workspaceId: string) => workspacePath(workspaceId, "content");

/**
 * Step 1 of connecting Canva: a pending row for this person, a PKCE pair on
 * it, then Canva's consent screen. Anyone who can add to the library can
 * connect their own Canva account.
 */
export async function GET(req: NextRequest) {
  const workspaceId = req.nextUrl.searchParams.get("workspaceId") ?? "";
  const back = (err?: string) => NextResponse.redirect(absoluteUrl(`${library(workspaceId)}${err ? `?error=${encodeURIComponent(err)}` : ""}`));
  const cfg = canvaAppConfig();
  if (!cfg) return back("Canva import is not configured on this server.");
  try {
    const ctx = await requireCapability(workspaceId, "content.create");
    const userId = ctx.session.user.id;
    await clearPendingSources(workspaceId, userId, "canva");
    const [row] = await db.insert(importSource).values({ organizationId: ctx.workspace.organizationId, workspaceId, kind: "canva", name: "Canva", status: "connecting", createdByUserId: userId }).returning();
    const { verifier, challenge } = pkcePair();
    const state = await createImportState(row, verifier);
    await audit({ action: "import.connect_start", actorUserId: userId, organizationId: ctx.workspace.organizationId, workspaceId, targetType: "import_source", targetId: row.id, summary: { after: { kind: "canva" } } });
    return NextResponse.redirect(canvaAuthorizeUrl(cfg.clientId, importCallbackUrl("canva"), state, challenge));
  } catch (e) {
    if (e instanceof AuthorizationError) return back("You do not have permission to add to this library.");
    throw e;
  }
}
