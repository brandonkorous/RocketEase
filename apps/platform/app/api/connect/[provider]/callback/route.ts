import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { ProviderError } from "@rocketease/providers";
import { db } from "@/db";
import { providerConnection } from "@/db/schema/connections";
import { audit } from "@/lib/audit";
import { callbackUrl, codeVerifierFor, consumeOAuthState } from "@/lib/connections";
import { log } from "@/lib/log";
import { getAdapter, isProviderKey, sealCredential } from "@/lib/providers";
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
  if (!st) return NextResponse.redirect(new URL("/?error=oauth_state", req.url));
  const back = (err?: string) => NextResponse.redirect(new URL(`${st.redirectTo ?? workspacePath(st.workspaceId, "accounts")}${err ? `?error=${encodeURIComponent(err)}` : ""}`, req.url));

  if (q.get("error")) {
    await audit({ action: "connection.cancelled", actorUserId: session.user.id, organizationId: st.organizationId, workspaceId: st.workspaceId, targetType: "provider", targetId: provider, summary: { note: q.get("error_description") ?? q.get("error") ?? undefined }, result: "denied" });
    return back("cancelled");
  }
  const code = q.get("code");
  if (!code) return back("missing_code");

  try {
    const adapter = getAdapter(provider);
    const cred = await adapter.exchangeCode(code, callbackUrl(provider), codeVerifierFor(state));

    let connectionId: string;
    if (st.reconnectConnectionId) {
      // Reauthorization preserves internal references when identity matches.
      const existing = await db.query.providerConnection.findFirst({ where: (c, { eq }) => eq(c.id, st.reconnectConnectionId!) });
      if (!existing || existing.workspaceId !== st.workspaceId) return back("reconnect_mismatch");
      if (existing.providerUserId !== cred.providerUserId) return back("reconnect_identity");
      connectionId = existing.id;
      await db
        .update(providerConnection)
        .set({ secret: sealCredential(connectionId, cred), scopes: cred.scopes, expiresAt: cred.expiresAt ? new Date(cred.expiresAt) : null, status: "selecting", lastError: null, lastRefreshedAt: new Date(), updatedAt: new Date() })
        .where(eq(providerConnection.id, connectionId));
    } else {
      const [row] = await db
        .insert(providerConnection)
        .values({
          organizationId: st.organizationId,
          workspaceId: st.workspaceId,
          provider,
          providerUserId: cred.providerUserId,
          providerUserName: cred.providerUserName,
          secret: { v: 1, keyId: "pending", iv: "", tag: "", ct: "" },
          scopes: cred.scopes,
          expiresAt: cred.expiresAt ? new Date(cred.expiresAt) : null,
          createdByUserId: session.user.id,
        })
        .returning({ id: providerConnection.id });
      connectionId = row.id;
      // Seal with the real id as AAD now that we have it.
      await db.update(providerConnection).set({ secret: sealCredential(connectionId, cred) }).where(eq(providerConnection.id, connectionId));
    }

    await audit({ action: "connection.authorized", actorUserId: session.user.id, organizationId: st.organizationId, workspaceId: st.workspaceId, targetType: "provider_connection", targetId: connectionId, summary: { after: { provider, scopes: cred.scopes } } });
    const nextQs = st.redirectTo && st.redirectTo !== workspacePath(st.workspaceId, "accounts") ? `?next=${encodeURIComponent(st.redirectTo)}` : "";
    return NextResponse.redirect(new URL(`${workspacePath(st.workspaceId, `accounts/select/${connectionId}`)}${nextQs}`, req.url));
  } catch (err) {
    log.error("oauth callback failed", { provider, err });
    const msg = err instanceof ProviderError ? err.category : "exchange_failed";
    await audit({ action: "connection.failed", actorUserId: session.user.id, organizationId: st.organizationId, workspaceId: st.workspaceId, targetType: "provider", targetId: provider, result: "error", summary: { note: msg } });
    return back(msg);
  }
}
