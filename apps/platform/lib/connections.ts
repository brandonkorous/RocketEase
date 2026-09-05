import { createHash, createHmac, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Credential, ProviderKey } from "@rocketease/providers";
import { db } from "@/db";
import { appUrl } from "@/lib/app-url";
import { oauthState, providerConnection } from "@/db/schema/connections";
import { sealCredential } from "@/lib/providers";

export const callbackUrl = (provider: ProviderKey) => `${appUrl()}/api/connect/${provider}/callback`;

/*
 * PKCE (RFC 7636) for providers that require it — X does. The verifier is
 * derived from the single-use state with a server-side secret rather than
 * stored, so both the redirect and the callback can recompute it without a
 * second round trip: an attacker who sees the state in a URL still cannot
 * produce the verifier. base64url of an HMAC is 43 unreserved characters,
 * exactly the shape RFC 7636 asks for.
 */
const pkceSecret = () => process.env.BETTER_AUTH_SECRET ?? "rke-dev-pkce";
export const codeVerifierFor = (state: string) => createHmac("sha256", pkceSecret()).update(`pkce:${state}`).digest("base64url");
export const codeChallengeFor = (state: string) => createHash("sha256").update(codeVerifierFor(state)).digest("base64url");

/** Create a single-use state row and return the opaque `state` value (id.nonce). */
export async function createOAuthState(input: {
  provider: ProviderKey;
  userId: string;
  organizationId: string;
  workspaceId: string;
  reconnectConnectionId?: string;
  redirectTo?: string;
}) {
  const nonce = randomBytes(24).toString("base64url");
  const [row] = await db
    .insert(oauthState)
    .values({ ...input, nonce, expiresAt: new Date(Date.now() + 10 * 60_000) })
    .returning({ id: oauthState.id });
  return `${row.id}.${nonce}`;
}

export type PersistConnectionInput = {
  provider: ProviderKey;
  cred: Credential;
  organizationId: string;
  workspaceId: string;
  userId: string;
  reconnectConnectionId?: string;
};
export type PersistConnectionResult = { connectionId: string } | { error: "reconnect_mismatch" | "reconnect_identity" };

/**
 * Store a fresh credential as a new connection in `selecting` state, or
 * re-arm an existing one. A reconnect keeps internal references only when the
 * network identity matches; the envelope is sealed with the row id as AAD, so
 * a new row is written first and sealed second.
 */
export async function persistConnection(input: PersistConnectionInput): Promise<PersistConnectionResult> {
  const { provider, cred, organizationId, workspaceId, userId, reconnectConnectionId } = input;
  const expiresAt = cred.expiresAt ? new Date(cred.expiresAt) : null;
  if (reconnectConnectionId) {
    const existing = await db.query.providerConnection.findFirst({ where: (c, { eq }) => eq(c.id, reconnectConnectionId) });
    if (!existing || existing.workspaceId !== workspaceId) return { error: "reconnect_mismatch" };
    if (existing.providerUserId !== cred.providerUserId) return { error: "reconnect_identity" };
    await db
      .update(providerConnection)
      .set({ secret: sealCredential(existing.id, cred), scopes: cred.scopes, expiresAt, status: "selecting", lastError: null, lastRefreshedAt: new Date(), updatedAt: new Date() })
      .where(eq(providerConnection.id, existing.id));
    return { connectionId: existing.id };
  }
  const [row] = await db
    .insert(providerConnection)
    .values({
      organizationId,
      workspaceId,
      provider,
      providerUserId: cred.providerUserId,
      providerUserName: cred.providerUserName,
      secret: { v: 1, keyId: "pending", iv: "", tag: "", ct: "" },
      scopes: cred.scopes,
      expiresAt,
      createdByUserId: userId,
    })
    .returning({ id: providerConnection.id });
  await db.update(providerConnection).set({ secret: sealCredential(row.id, cred) }).where(eq(providerConnection.id, row.id));
  return { connectionId: row.id };
}

/** Validate + consume the state. Returns null when invalid/expired/used or bound to another user. */
export async function consumeOAuthState(state: string, userId: string) {
  const [id, nonce] = state.split(".");
  if (!id || !nonce) return null;
  const row = await db.query.oauthState.findFirst({ where: (s, { eq }) => eq(s.id, id) });
  if (!row || row.nonce !== nonce || row.userId !== userId || row.usedAt || row.expiresAt < new Date()) return null;
  const updated = await db
    .update(oauthState)
    .set({ usedAt: new Date() })
    .where(and(eq(oauthState.id, id), eq(oauthState.nonce, nonce)))
    .returning({ id: oauthState.id });
  return updated.length ? row : null;
}
