"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { isProviderError } from "@rocketease/providers";
import { audit } from "@/lib/audit";
import { AuthorizationError } from "@/lib/authz";
import { persistConnection } from "@/lib/connections";
import { log } from "@/lib/log";
import { getAdapter, isProviderKey } from "@/lib/providers";
import { requireCapability } from "@/lib/session";
import { workspacePath } from "@/lib/nav";

/** On error the non-secret fields come back so the form can keep them; a password is never echoed. */
export type CredentialsState = { error?: string; values?: Record<string, string> };

const RECONNECT_ERRORS: Record<string, string> = {
  reconnect_mismatch: "That connection belongs to another workspace.",
  reconnect_identity: "That's a different account than the one you're reconnecting. Sign in with the original account.",
};

/**
 * Credentials sign-in for networks without OAuth (Bluesky app passwords). The
 * adapter verifies the credentials with the network and returns a Credential;
 * the secret itself is sealed at rest exactly like an OAuth token and never
 * logged. Ends on the same channel-selection step as the OAuth callback.
 */
export async function signInWithCredentials(_prev: CredentialsState, formData: FormData): Promise<CredentialsState> {
  const parsed = z
    .object({ workspaceId: z.string().min(1), provider: z.string().min(1), reconnect: z.string().optional(), next: z.string().optional() })
    .safeParse({ workspaceId: formData.get("workspaceId"), provider: formData.get("provider"), reconnect: formData.get("reconnect") || undefined, next: formData.get("next") || undefined });
  if (!parsed.success) return { error: "The form is missing its workspace or network." };
  const { workspaceId, provider, reconnect, next } = parsed.data;
  if (!isProviderKey(provider)) return { error: "That network is not enabled in this deployment." };

  let ctx: Awaited<ReturnType<typeof requireCapability>>;
  try {
    ctx = await requireCapability(workspaceId, "channels.manage");
  } catch (e) {
    if (e instanceof AuthorizationError) return { error: "Only workspace owners and admins can connect accounts." };
    throw e;
  }
  const adapter = getAdapter(provider);
  if (!adapter.signIn || !adapter.credentialsForm) return { error: `${adapter.displayName} connects through its own sign-in page, not a form.` };

  const values: Record<string, string> = {};
  for (const f of adapter.credentialsForm.fields) values[f.name] = String(formData.get(f.name) ?? "");
  const keep = Object.fromEntries(adapter.credentialsForm.fields.filter((f) => f.type !== "password").map((f) => [f.name, values[f.name]]));
  const fail = (error: string): CredentialsState => ({ error, values: keep });
  const actor = { actorUserId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId };

  let connectionId: string;
  try {
    await audit({ ...actor, action: "connection.start", targetType: "provider", targetId: provider });
    const cred = await adapter.signIn(values);
    const saved = await persistConnection({ provider, cred, organizationId: ctx.workspace.organizationId, workspaceId, userId: ctx.session.user.id, reconnectConnectionId: reconnect });
    if ("error" in saved) return fail(RECONNECT_ERRORS[saved.error]);
    connectionId = saved.connectionId;
    await audit({ ...actor, action: "connection.authorized", targetType: "provider_connection", targetId: connectionId, summary: { after: { provider, scopes: cred.scopes } } });
  } catch (err) {
    log.warn("credentials sign-in failed", { provider, category: isProviderError(err) ? err.category : "unknown" });
    await audit({ ...actor, action: "connection.failed", targetType: "provider", targetId: provider, result: "error", summary: { note: isProviderError(err) ? err.category : "sign_in_failed" } });
    if (isProviderError(err)) return fail(err.category === "permission" ? `${adapter.displayName} did not accept that sign-in. Check the handle and app password.` : err.message);
    return fail(`${adapter.displayName} did not complete the sign-in. Try again in a moment.`);
  }

  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
  redirect(`${workspacePath(workspaceId, `accounts/select/${connectionId}`)}${safeNext ? `?next=${encodeURIComponent(safeNext)}` : ""}`);
}
