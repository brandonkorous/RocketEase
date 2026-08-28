import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { ProviderKey } from "@make-it-social/providers";
import { db } from "@/db";
import { oauthState } from "@/db/schema/connections";

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:5001";

export const callbackUrl = (provider: ProviderKey) => `${appUrl()}/api/connect/${provider}/callback`;

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
