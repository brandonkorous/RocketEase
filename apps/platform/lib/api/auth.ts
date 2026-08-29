import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { apiKey } from "@/db/schema/api";
import { workspace, workspaceMembership, type WorkspaceRole } from "@/db/schema/app";
import { can, type Capability } from "@/lib/authz";
import { rateLimit } from "@/lib/reports/rate-limit";
import { ApiError, forbidden, unauthorized } from "./errors";
import { bearerFrom, hashApiKey } from "./keys";

/** Requests per key per minute. In-memory and per process (lib/reports/rate-limit.ts). */
export const API_RATE_LIMIT = 120;

/** Everything a /api/v1 route may act on: one workspace, as one person, with one scope set. */
export type ApiContext = {
  keyId: string;
  keyName: string;
  organizationId: string;
  workspaceId: string;
  workspaceName: string;
  timezone: string;
  /** The key's creator. Every write is audited as them, never as "the API". */
  actorUserId: string;
  role: WorkspaceRole;
  grants: string[];
  scopes: Capability[];
};

/**
 * Bearer authentication for the public API. The key is looked up by hash, then
 * the creator's live membership is re-read: a demoted or deprovisioned creator
 * narrows or kills the key on the very next request, without any revocation.
 */
export async function authenticateApi(req: Request): Promise<ApiContext> {
  const raw = bearerFrom(req.headers.get("authorization"));
  if (!raw) throw unauthorized("Send your key as `Authorization: Bearer rke_…`.");
  const row = await db.query.apiKey.findFirst({ where: and(eq(apiKey.keyHash, hashApiKey(raw)), isNull(apiKey.revokedAt)) });
  if (!row) throw unauthorized("Invalid or revoked API key.");

  const limit = rateLimit(`api:${row.id}`, API_RATE_LIMIT, 60_000);
  if (!limit.ok) {
    throw new ApiError(429, "rate_limited", `Too many requests for this key (${API_RATE_LIMIT}/minute).`, { "retry-after": String(limit.retryAfterSeconds) });
  }
  await db.update(apiKey).set({ lastUsedAt: new Date() }).where(eq(apiKey.id, row.id));

  const ws = await db.query.workspace.findFirst({ where: and(eq(workspace.id, row.workspaceId), isNull(workspace.archivedAt)) });
  if (!ws) throw forbidden("This key's workspace is archived.");
  if (!row.createdByUserId) throw forbidden("This key has no owner. Create a new one.");
  const member = await db.query.workspaceMembership.findFirst({
    where: and(eq(workspaceMembership.workspaceId, row.workspaceId), eq(workspaceMembership.userId, row.createdByUserId), isNull(workspaceMembership.deactivatedAt)),
  });
  if (!member) throw forbidden("The person who created this key no longer has access to the workspace.");

  return {
    keyId: row.id,
    keyName: row.name,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    workspaceName: ws.name,
    timezone: ws.timezone,
    actorUserId: row.createdByUserId,
    role: member.role,
    grants: member.grants,
    scopes: row.scopes as Capability[],
  };
}

/**
 * Deny wins twice: the key must carry the scope AND the creator must still
 * hold the capability. `policy`/`assigned` capabilities are resolved by the
 * caller exactly as a server action resolves them.
 */
export function requireScope(ctx: ApiContext, cap: Capability, resolved?: { policyAllows?: boolean; isAssigned?: boolean }) {
  if (!ctx.scopes.includes(cap)) throw forbidden(`This key is not scoped for ${cap}.`);
  if (!can({ role: ctx.role, grants: ctx.grants }, cap, resolved)) throw forbidden(`The key's owner can no longer do ${cap} in this workspace.`);
}

/** Optional `Idempotency-Key`, namespaced per key so two agents can reuse the same string. */
export function idempotencyKey(ctx: ApiContext, req: Request): string | null {
  const raw = req.headers.get("idempotency-key")?.trim();
  if (!raw) return null;
  if (raw.length > 200) throw new ApiError(400, "invalid_request", "Idempotency-Key must be 200 characters or fewer.");
  return `api:${ctx.keyId}:${raw}`;
}
