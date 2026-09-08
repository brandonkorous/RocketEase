/*
 * Canva Connect API client (M14.9). Every call here is documented at
 * canva.dev/docs/connect and checked on 2026-09-06:
 *   authorize   GET  https://www.canva.com/api/oauth/authorize   PKCE S256 is required
 *   token       POST /rest/v1/oauth/token                        basic auth {client id}:{secret}, form body;
 *                                                                access tokens last 4 h, a refresh token is single-use
 *   profile     GET  /rest/v1/users/me/profile                   display_name (10 requests a minute per user)
 *   designs     GET  /rest/v1/designs?query&continuation&ownership&sort_by   (100 a minute per user)
 *   export      POST /rest/v1/exports  { design_id, format }     → job { id, status, urls[], error }  (20 a minute per user)
 *   export job  GET  /rest/v1/exports/{id}                       urls one per page, valid 24 h  (120 a minute per user)
 * Worker-safe: no server-only, no next/headers. `CANVA_API_BASE` exists so a
 * local check can point at a stub; production never sets it.
 */
import { createHash, randomBytes } from "node:crypto";
import { categoryFromStatus, httpJson, ProviderError } from "@rocketease/providers";

export const CANVA_AUTHORIZE = "https://www.canva.com/api/oauth/authorize";
export const canvaApi = () => (process.env.CANVA_API_BASE ?? "https://api.canva.com").replace(/\/+$/, "");
/** Read a person's designs and export them; the profile scope names the account in the library. */
export const CANVA_SCOPES = ["design:meta:read", "design:content:read", "profile:read"];

export type CanvaConfig = { clientId: string; clientSecret: string };
export type CanvaCredential = { accessToken: string; refreshToken: string; expiresAt: string; scopes: string[] };
export type CanvaDesign = { id: string; title?: string; thumbnail?: { url?: string; width?: number; height?: number }; updated_at?: number; page_count?: number; urls?: { edit_url?: string; view_url?: string } };
export type CanvaExportJob = { id: string; status: "in_progress" | "success" | "failed"; urls?: string[]; error?: { code?: string; message?: string } };
/** The formats the library imports; video needs an orientation Canva must be told, so it waits. */
export type ImportFormat = "png" | "jpg";

type CanvaError = { code?: string; message?: string; error?: string; error_description?: string };
type TokenRes = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string } & CanvaError;

export const canvaAppConfig = (): CanvaConfig | null => (process.env.CANVA_CLIENT_ID ? { clientId: process.env.CANVA_CLIENT_ID, clientSecret: process.env.CANVA_CLIENT_SECRET ?? "" } : null);

/** PKCE pair: a 43-character verifier and its S256 challenge, both base64url. */
export function pkcePair() {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

export function canvaAuthorizeUrl(clientId: string, redirectUri: string, state: string, challenge: string) {
  const u = new URL(CANVA_AUTHORIZE);
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("scope", CANVA_SCOPES.join(" "));
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);
  return u.toString();
}

/** Canva's error envelope onto the shared taxonomy; a POST that timed out or 5xx'd may have acted. */
function mapCanvaError(status: number, body: CanvaError | string | null, mutating: boolean, headers?: Headers): ProviderError {
  const e = typeof body === "object" && body ? body : {};
  const message = e.message ?? e.error_description ?? e.error ?? `Canva API error (${status})`;
  const retryAfter = Number(headers?.get("retry-after") ?? "");
  return new ProviderError(message, { category: categoryFromStatus(status), providerCode: e.code ?? e.error, ambiguous: mutating && status >= 500, retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined });
}

async function canva<T>(path: string, token: string, init: { method?: "GET" | "POST"; body?: unknown; query?: Record<string, string | undefined> } = {}): Promise<T> {
  const url = new URL(`${canvaApi()}/rest/v1${path}`);
  for (const [k, v] of Object.entries(init.query ?? {})) if (v) url.searchParams.set(k, v);
  const method = init.method ?? "GET";
  const res = await httpJson<T & CanvaError>(url.toString(), { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: init.body !== undefined ? JSON.stringify(init.body) : undefined, timeoutMs: 30_000 });
  if (res.status >= 400) throw mapCanvaError(res.status, res.body, method !== "GET", res.headers);
  return res.body;
}

async function tokenCall(cfg: CanvaConfig, params: Record<string, string>): Promise<CanvaCredential> {
  const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
  const res = await httpJson<TokenRes>(`${canvaApi()}/rest/v1/oauth/token`, { method: "POST", headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params).toString(), timeoutMs: 30_000 });
  if (res.status >= 400 || !res.body?.access_token || !res.body.refresh_token) throw mapCanvaError(res.status, res.body, false, res.headers);
  const seconds = res.body.expires_in ?? 4 * 3600;
  return { accessToken: res.body.access_token, refreshToken: res.body.refresh_token, expiresAt: new Date(Date.now() + seconds * 1000).toISOString(), scopes: (res.body.scope ?? "").split(/\s+/).filter(Boolean) };
}

export const exchangeCanvaCode = (cfg: CanvaConfig, code: string, codeVerifier: string, redirectUri: string) => tokenCall(cfg, { grant_type: "authorization_code", code, code_verifier: codeVerifier, redirect_uri: redirectUri });
export const refreshCanvaToken = (cfg: CanvaConfig, refreshToken: string) => tokenCall(cfg, { grant_type: "refresh_token", refresh_token: refreshToken });

export async function canvaProfile(token: string): Promise<{ displayName: string }> {
  const r = await canva<{ profile?: { display_name?: string } }>("/users/me/profile", token);
  return { displayName: r.profile?.display_name?.trim() || "Canva account" };
}

export async function canvaUser(token: string): Promise<{ userId?: string; teamId?: string }> {
  const r = await canva<{ team_user?: { user_id?: string; team_id?: string } }>("/users/me", token);
  return { userId: r.team_user?.user_id, teamId: r.team_user?.team_id };
}

/** Newest first, the person's own and shared designs; `continuation` pages forward. */
export async function listCanvaDesigns(token: string, opts: { query?: string; continuation?: string } = {}): Promise<{ items: CanvaDesign[]; continuation?: string }> {
  const r = await canva<{ items?: CanvaDesign[]; continuation?: string }>("/designs", token, { query: { query: opts.query?.trim().slice(0, 255) || undefined, continuation: opts.continuation, ownership: "any", sort_by: opts.query ? "relevance" : "modified_descending" } });
  return { items: (r.items ?? []).filter((d) => Boolean(d.id)), continuation: r.continuation };
}

/** PNG lossless at the design's own size; JPG at quality 90. One url per page comes back. */
export const exportBody = (designId: string, format: ImportFormat) => ({ design_id: designId, format: format === "png" ? { type: "png", lossless: true } : { type: "jpg", quality: 90 } });

export async function createCanvaExport(token: string, designId: string, format: ImportFormat): Promise<CanvaExportJob> {
  const r = await canva<{ job?: CanvaExportJob }>("/exports", token, { method: "POST", body: exportBody(designId, format) });
  if (!r.job?.id) throw new ProviderError("Canva returned no export job", { category: "unknown", ambiguous: true });
  return r.job;
}

export async function getCanvaExport(token: string, exportId: string): Promise<CanvaExportJob> {
  const r = await canva<{ job?: CanvaExportJob }>(`/exports/${encodeURIComponent(exportId)}`, token);
  if (!r.job?.id) throw new ProviderError("Canva returned no export job", { category: "unknown" });
  return r.job;
}

export const MIME: Record<ImportFormat, string> = { png: "image/png", jpg: "image/jpeg" };
