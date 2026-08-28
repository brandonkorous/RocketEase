/*
 * OAuth state for tracking sources. The provider `oauth_state` table is keyed
 * to the provider_key enum, so tracking keeps its own single-use nonce on the
 * source row it belongs to: the state is "{sourceId}.{nonce}", the nonce is
 * cleared the first time it is redeemed, and it expires in 10 minutes.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { trackingSource, type TrackingKind, type TrackingSource } from "@/db/schema/tracking";

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:5001";
export const trackingCallbackUrl = (kind: TrackingKind) => `${appUrl()}/api/tracking/${kind}/callback`;
export const trackingWebhookUrl = (sourceId: string) => `${appUrl()}/api/webhooks/tracking/${sourceId}`;

const STATE_TTL_MS = 10 * 60_000;

/** Attach a fresh nonce to a source that is mid-connect and return the opaque state. */
export async function createTrackingState(source: TrackingSource): Promise<string> {
  const nonce = randomBytes(24).toString("base64url");
  await db
    .update(trackingSource)
    .set({ config: { ...source.config, oauthNonce: nonce, oauthExpiresAt: new Date(Date.now() + STATE_TTL_MS).toISOString() }, updatedAt: new Date() })
    .where(eq(trackingSource.id, source.id));
  return `${source.id}.${nonce}`;
}

const equal = (a: string, b: string) => {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Validate + consume. Returns null when the state is unknown, expired, reused, or the wrong kind. */
export async function consumeTrackingState(state: string, kind: TrackingKind): Promise<TrackingSource | null> {
  const [sourceId, nonce] = state.split(".");
  if (!sourceId || !nonce) return null;
  const row = await db.query.trackingSource.findFirst({ where: (s, { eq: e }) => e(s.id, sourceId) });
  if (!row || row.kind !== kind || !row.config.oauthNonce || !equal(row.config.oauthNonce, nonce)) return null;
  const expires = row.config.oauthExpiresAt ? Date.parse(row.config.oauthExpiresAt) : 0;
  if (!expires || expires < Date.now()) return null;
  const { oauthNonce: _n, oauthExpiresAt: _e, ...config } = row.config;
  // Clearing the nonce is the single-use gate: two concurrent callbacks race here and only one wins.
  const cleared = await db
    .update(trackingSource)
    .set({ config, updatedAt: new Date() })
    .where(and(eq(trackingSource.id, sourceId), sql`${trackingSource.config}->>'oauthNonce' = ${nonce}`))
    .returning({ id: trackingSource.id });
  return cleared.length ? { ...row, config } : null;
}
