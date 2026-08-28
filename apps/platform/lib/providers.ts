/*
 * Provider registry + credential access for the platform.
 * Adapters are configured from env; a provider without credentials is not
 * offered (that IS the feature flag for M1.11 at the provider level).
 */
import { eq } from "drizzle-orm";
import { createProviderRegistry, ProviderError, type ChannelDescriptor, type Credential, type ProviderAdapter, type ProviderKey } from "@make-it-social/providers";
import { db } from "@/db";
import { channel, providerConnection, type Channel, type ProviderConnection } from "@/db/schema/connections";
import { decryptJson, encryptJson } from "./crypto";
import { log } from "./log";

const g = globalThis as unknown as { __misProviders?: Map<ProviderKey, ProviderAdapter> };

export function providers(): Map<ProviderKey, ProviderAdapter> {
  if (!g.__misProviders) {
    g.__misProviders = createProviderRegistry({
      enableMock: process.env.PROVIDERS_ENABLE_MOCK === "1",
      meta: process.env.META_APP_ID ? { clientId: process.env.META_APP_ID, clientSecret: process.env.META_APP_SECRET ?? "", extra: { webhookVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN ?? "" } } : undefined,
      linkedin: process.env.LINKEDIN_CLIENT_ID ? { clientId: process.env.LINKEDIN_CLIENT_ID, clientSecret: process.env.LINKEDIN_CLIENT_SECRET ?? "" } : undefined,
      tiktok: process.env.TIKTOK_CLIENT_KEY ? { clientId: process.env.TIKTOK_CLIENT_KEY, clientSecret: process.env.TIKTOK_CLIENT_SECRET ?? "" } : undefined,
      youtube: process.env.YOUTUBE_CLIENT_ID ? { clientId: process.env.YOUTUBE_CLIENT_ID, clientSecret: process.env.YOUTUBE_CLIENT_SECRET ?? "" } : undefined,
      pinterest: process.env.PINTEREST_APP_ID ? { clientId: process.env.PINTEREST_APP_ID, clientSecret: process.env.PINTEREST_APP_SECRET ?? "" } : undefined,
      x: process.env.X_CLIENT_ID ? { clientId: process.env.X_CLIENT_ID, clientSecret: process.env.X_CLIENT_SECRET ?? "" } : undefined,
    });
  }
  return g.__misProviders;
}

export function getAdapter(key: string): ProviderAdapter {
  const a = providers().get(key as ProviderKey);
  if (!a) throw new ProviderError(`Provider "${key}" is not enabled in this deployment.`, { category: "permission" });
  return a;
}

export const isProviderKey = (k: string): k is ProviderKey => providers().has(k as ProviderKey);

/** Credentials are bound to the connection id (AAD) so an envelope can't be moved between rows. */
export const sealCredential = (connectionId: string, cred: Credential) => encryptJson(cred, `conn:${connectionId}`);
export const openCredential = (conn: ProviderConnection) => decryptJson<Credential>(conn.secret, `conn:${conn.id}`);

/**
 * Load a usable credential, refreshing when within 24h of expiry. Persists the
 * refreshed token. Marks the connection expired/revoked on permission errors.
 */
export async function loadCredential(conn: ProviderConnection): Promise<Credential> {
  let cred = openCredential(conn);
  const adapter = getAdapter(conn.provider);
  const soon = Date.now() + 24 * 3_600_000;
  if (cred.expiresAt && new Date(cred.expiresAt).getTime() < soon) {
    try {
      cred = await adapter.refresh(cred);
      await db
        .update(providerConnection)
        .set({ secret: sealCredential(conn.id, cred), expiresAt: cred.expiresAt ? new Date(cred.expiresAt) : null, lastRefreshedAt: new Date(), status: "active", lastError: null, updatedAt: new Date() })
        .where(eq(providerConnection.id, conn.id));
    } catch (err) {
      if (err instanceof ProviderError && err.category === "permission") {
        await db.update(providerConnection).set({ status: "expired", lastError: err.message, updatedAt: new Date() }).where(eq(providerConnection.id, conn.id));
        await db.update(channel).set({ status: "action_required", health: { tokenOk: false, permissionsOk: false, message: err.message, lastCheckedAt: new Date().toISOString() } }).where(eq(channel.connectionId, conn.id));
      }
      log.warn("credential refresh failed", { connectionId: conn.id, provider: conn.provider, err });
      throw err;
    }
  }
  return cred;
}

/** Rebuild the adapter-facing ChannelDescriptor from a DB row (with its own token if any). */
export function toDescriptor(ch: Channel): ChannelDescriptor {
  return {
    remoteId: ch.remoteId,
    kind: ch.kind,
    network: ch.network,
    name: ch.name,
    handle: ch.handle ?? undefined,
    avatarUrl: ch.avatarUrl ?? undefined,
    channelToken: ch.channelSecret ? decryptJson<{ token: string }>(ch.channelSecret, `chan:${ch.id}`).token : undefined,
    capabilities: ch.capabilities,
  };
}

export const sealChannelToken = (channelId: string, token: string) => encryptJson({ token }, `chan:${channelId}`);
