/*
 * OAuth for Google Business Profile. Identical to the YouTube adapter's flow —
 * same Google endpoints, same `access_type=offline&prompt=consent` requirement
 * for a refresh token, same non-rotating refresh tokens — with one scope
 * (business.manage) and a different identity read.
 */
import type { AuthorizeParams, Credential, ProviderConfig } from "../types";
import { ProviderError } from "../types";
import { form, httpJson } from "../http";
import { googleAuthorizeUrl, googleTokenCall, OAUTH_REVOKE } from "../youtube/client";
import { SCOPES } from "./client";

export const DEFAULT_SCOPES = [...SCOPES.manage];

const expiry = (s: number | undefined, fallback?: string) => (s ? new Date(Date.now() + s * 1000).toISOString() : fallback);

/** Who the grant belongs to; the first Business Profile account we can see. */
export type Identity = { id?: string; name?: string };

export function googleBusinessOAuth(cfg: ProviderConfig, identify: (cred: Credential) => Promise<Identity>) {
  return {
    authorizationUrl({ state, redirectUri, scopes: extra }: AuthorizeParams) {
      return googleAuthorizeUrl({ clientId: cfg.clientId, redirectUri, state, scopes: [...DEFAULT_SCOPES, ...(extra ?? [])] });
    },

    async exchangeCode(code: string, redirectUri: string): Promise<Credential> {
      const t = await googleTokenCall({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: cfg.clientId, client_secret: cfg.clientSecret });
      const cred: Credential = { accessToken: t.access_token!, refreshToken: t.refresh_token, expiresAt: expiry(t.expires_in), scopes: (t.scope ?? "").split(" ").filter(Boolean), providerUserId: "unknown" };
      const who = await identify(cred).catch(() => ({}) as Identity);
      return { ...cred, providerUserId: who.id ?? "unknown", providerUserName: who.name };
    },

    /** Google refresh tokens do not rotate; the response carries no new one. */
    async refresh(cred: Credential): Promise<Credential> {
      if (!cred.refreshToken) throw new ProviderError("Google Business Profile access expired; reconnect required.", { category: "permission", providerCode: "no_refresh_token" });
      const t = await googleTokenCall({ grant_type: "refresh_token", refresh_token: cred.refreshToken, client_id: cfg.clientId, client_secret: cfg.clientSecret });
      return { ...cred, accessToken: t.access_token!, refreshToken: t.refresh_token ?? cred.refreshToken, expiresAt: expiry(t.expires_in, cred.expiresAt), scopes: t.scope ? t.scope.split(" ").filter(Boolean) : cred.scopes };
    },

    /** Revoking either token kills the whole grant for this client. */
    async revoke(cred: Credential): Promise<void> {
      await httpJson(OAUTH_REVOKE, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form({ token: cred.refreshToken ?? cred.accessToken }) }).catch(() => undefined);
    },
  };
}
