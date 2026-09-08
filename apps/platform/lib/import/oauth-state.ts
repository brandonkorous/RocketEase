/*
 * OAuth state for import sources, the tracking-source way: the pending row
 * carries a single-use nonce and the PKCE verifier; the state is
 * "{sourceId}.{nonce}", cleared the first time it is redeemed, expiring in
 * 10 minutes.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { importSource, type ImportKind, type ImportSource } from "@/db/schema/imports";
import { appUrl } from "@/lib/app-url";

export const importCallbackUrl = (kind: ImportKind) => `${appUrl()}/api/import/${kind}/callback`;
const STATE_TTL_MS = 10 * 60_000;

/** Attach a nonce and the PKCE verifier to a source mid-connect; returns the opaque state. */
export async function createImportState(source: ImportSource, codeVerifier: string): Promise<string> {
  const nonce = randomBytes(24).toString("base64url");
  await db.update(importSource).set({ config: { ...source.config, oauthNonce: nonce, oauthExpiresAt: new Date(Date.now() + STATE_TTL_MS).toISOString(), codeVerifier }, updatedAt: new Date() }).where(eq(importSource.id, source.id));
  return `${source.id}.${nonce}`;
}

const equal = (a: string, b: string) => {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Validate + consume; the verifier comes back once, with the row. Null when unknown, expired, reused or the wrong kind. */
export async function consumeImportState(state: string, kind: ImportKind): Promise<{ source: ImportSource; codeVerifier: string } | null> {
  const [sourceId, nonce] = state.split(".");
  if (!sourceId || !nonce) return null;
  const row = await db.query.importSource.findFirst({ where: (s, { eq: e }) => e(s.id, sourceId) });
  if (!row || row.kind !== kind || !row.config.oauthNonce || !row.config.codeVerifier || !equal(row.config.oauthNonce, nonce)) return null;
  const expires = row.config.oauthExpiresAt ? Date.parse(row.config.oauthExpiresAt) : 0;
  if (!expires || expires < Date.now()) return null;
  const { oauthNonce: _n, oauthExpiresAt: _e, codeVerifier, ...config } = row.config;
  // Clearing the nonce is the single-use gate: two concurrent callbacks race here and only one wins.
  const cleared = await db.update(importSource).set({ config, updatedAt: new Date() }).where(and(eq(importSource.id, sourceId), sql`${importSource.config}->>'oauthNonce' = ${nonce}`)).returning({ id: importSource.id });
  return cleared.length ? { source: { ...row, config }, codeVerifier } : null;
}
