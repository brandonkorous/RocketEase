import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { apiKey } from "@/db/schema/api";
import { user } from "@/db/schema/auth";
import { capabilitiesOf } from "@/lib/authz";
import type { WorkspaceContext } from "@/lib/session";
import { hasCapability } from "@/lib/session";
import { formatInZone } from "@/lib/time";
import { API_SCOPES } from "./scopes";

export type ApiKeyRow = { id: string; name: string; prefix: string; scopes: string[]; createdBy: string; createdAt: string; lastUsedAt: string | null; revoked: boolean };
export type ApiKeysData = {
  canManage: boolean;
  baseUrl: string;
  keys: ApiKeyRow[];
  /** Scopes this member may hand to a key: the API's own list ∩ their capabilities. */
  offered: typeof API_SCOPES;
};

export const EMPTY_API_KEYS: ApiKeysData = { canManage: false, baseUrl: "", keys: [], offered: [] };

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:5001";

export async function apiKeysData(ctx: WorkspaceContext): Promise<ApiKeysData> {
  const mine = new Set(capabilitiesOf({ role: ctx.workspace.role, grants: ctx.workspace.grants }));
  const rows = await db
    .select({ k: apiKey, by: user.name })
    .from(apiKey)
    .leftJoin(user, eq(user.id, apiKey.createdByUserId))
    .where(eq(apiKey.workspaceId, ctx.workspace.id))
    .orderBy(desc(apiKey.createdAt))
    .limit(50);
  const stamp = (d: Date) => formatInZone(d, ctx.workspace.timezone, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return {
    canManage: hasCapability(ctx.workspace, "workspace.settings"),
    baseUrl: `${appUrl()}/api/v1`,
    offered: API_SCOPES.filter((s) => mine.has(s.scope)),
    keys: rows.map(({ k, by }) => ({
      id: k.id,
      name: k.name,
      prefix: k.prefix,
      scopes: k.scopes,
      createdBy: by ?? "—",
      createdAt: stamp(k.createdAt),
      lastUsedAt: k.lastUsedAt ? stamp(k.lastUsedAt) : null,
      revoked: Boolean(k.revokedAt),
    })),
  };
}
