import { NextResponse, type NextRequest } from "next/server";
import { ProviderError } from "@rocketease/providers";
import { absoluteUrl } from "@/lib/app-url";
import { audit } from "@/lib/audit";
import { callbackUrl, codeVerifierFor, consumeOAuthState, persistConnection } from "@/lib/connections";
import { log } from "@/lib/log";
import { getAdapter, isProviderKey } from "@/lib/providers";
import { requireUser } from "@/lib/session";
import { workspacePath } from "@/lib/nav";

export const dynamic = "force-dynamic";

/**
 * Steps 3–4: exchange the code, encrypt the credential, then send the user to
 * explicit channel selection. A cancelled consent returns to Connected
 * accounts with the reason — nothing is created.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const q = req.nextUrl.searchParams;
  const session = await requireUser();
  if (!isProviderKey(provider)) return NextResponse.json({ error: "Unknown provider" }, { status: 404 });

  const state = q.get("state") ?? "";
  const st = await consumeOAuthState(state, session.user.id);
  if (!st) return NextResponse.redirect(absoluteUrl("/?error=oauth_state"));
  const back = (err?: string) => NextResponse.redirect(absoluteUrl(`${st.redirectTo ?? workspacePath(st.workspaceId, "accounts")}${err ? `?error=${encodeURIComponent(err)}` : ""}`));

  if (q.get("error")) {
    await audit({ action: "connection.cancelled", actorUserId: session.user.id, organizationId: st.organizationId, workspaceId: st.workspaceId, targetType: "provider", targetId: provider, summary: { note: q.get("error_description") ?? q.get("error") ?? undefined }, result: "denied" });
    return back("cancelled");
  }
  const code = q.get("code");
  if (!code) return back("missing_code");

  try {
    const adapter = getAdapter(provider);
    const cred = await adapter.exchangeCode(code, callbackUrl(provider), codeVerifierFor(state));

    const saved = await persistConnection({ provider, cred, organizationId: st.organizationId, workspaceId: st.workspaceId, userId: session.user.id, reconnectConnectionId: st.reconnectConnectionId ?? undefined });
    if ("error" in saved) return back(saved.error);
    const { connectionId } = saved;

    await audit({ action: "connection.authorized", actorUserId: session.user.id, organizationId: st.organizationId, workspaceId: st.workspaceId, targetType: "provider_connection", targetId: connectionId, summary: { after: { provider, scopes: cred.scopes } } });
    const nextQs = st.redirectTo && st.redirectTo !== workspacePath(st.workspaceId, "accounts") ? `?next=${encodeURIComponent(st.redirectTo)}` : "";
    return NextResponse.redirect(absoluteUrl(`${workspacePath(st.workspaceId, `accounts/select/${connectionId}`)}${nextQs}`));
  } catch (err) {
    log.error("oauth callback failed", { provider, err });
    const msg = err instanceof ProviderError ? err.category : "exchange_failed";
    await audit({ action: "connection.failed", actorUserId: session.user.id, organizationId: st.organizationId, workspaceId: st.workspaceId, targetType: "provider", targetId: provider, result: "error", summary: { note: msg } });
    return back(msg);
  }
}
