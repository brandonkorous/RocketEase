import { NextResponse, type NextRequest } from "next/server";
import { AuthorizationError } from "@/lib/authz";
import { absoluteUrl } from "@/lib/app-url";
import { audit } from "@/lib/audit";
import { callbackUrl, codeChallengeFor, createOAuthState } from "@/lib/connections";
import { getAdapter, isProviderKey } from "@/lib/providers";
import { requireCapability } from "@/lib/session";
import { workspacePath } from "@/lib/nav";

export const dynamic = "force-dynamic";

/**
 * Step 2 of the connection flow: signed state tied to user/org/workspace,
 * then redirect to the provider's consent screen. Only channels.manage.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const workspaceId = req.nextUrl.searchParams.get("workspaceId") ?? "";
  const reconnect = req.nextUrl.searchParams.get("reconnect") ?? undefined;
  const next = req.nextUrl.searchParams.get("next") ?? "";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : null;
  if (!isProviderKey(provider)) return NextResponse.json({ error: "Unknown provider" }, { status: 404 });

  try {
    const ctx = await requireCapability(workspaceId, "channels.manage");
    const state = await createOAuthState({
      provider,
      userId: ctx.session.user.id,
      organizationId: ctx.workspace.organizationId,
      workspaceId,
      reconnectConnectionId: reconnect,
      redirectTo: safeNext ?? workspacePath(workspaceId, "accounts"),
    });
    await audit({ action: "connection.start", actorUserId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId, targetType: "provider", targetId: provider });
    // PKCE params are always supplied; adapters that do not need them ignore them.
    return NextResponse.redirect(getAdapter(provider).authorizationUrl({ state, redirectUri: callbackUrl(provider), codeChallenge: codeChallengeFor(state), codeChallengeMethod: "S256" }));
  } catch (e) {
    if (e instanceof AuthorizationError) return NextResponse.redirect(absoluteUrl(`${workspacePath(workspaceId, "accounts")}?error=forbidden`));
    throw e;
  }
}
