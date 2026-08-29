/*
 * Database reads for the rights rules. No `server-only`: the publish worker
 * and the nightly expiry sweep import this too.
 */
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { asset } from "@/db/schema/assets";
import { authorizationGrant, type AuthorizationGrant } from "@/db/schema/rights";
import type { RightsAsset, RightsGrant } from "./types";

export const toRightsGrant = (g: AuthorizationGrant): RightsGrant => ({
  id: g.id, kind: g.kind, scope: g.scope, label: g.label, assetId: g.assetId,
  channelId: g.channelId, creatorHandle: g.creatorHandle, startsAt: g.startsAt, expiresAt: g.expiresAt, revokedAt: g.revokedAt,
});

/** Rights facts for the assets a post or promotion uses (deleted assets are handled elsewhere). */
export async function rightsAssets(assetIds: string[]): Promise<RightsAsset[]> {
  if (assetIds.length === 0) return [];
  const rows = await db
    .select({ id: asset.id, fileName: asset.fileName, rightsScope: asset.rightsScope, rightsExpiresAt: asset.rightsExpiresAt })
    .from(asset)
    .where(and(inArray(asset.id, assetIds), isNull(asset.deletedAt)));
  return rows;
}

/**
 * Grants that could gate this use: attached to one of the assets, or to the
 * channel. Revoked grants are included so the rules can say they were revoked.
 */
export async function grantsForUse(workspaceId: string, assetIds: string[], channelId?: string | null): Promise<RightsGrant[]> {
  const subjects = [assetIds.length ? inArray(authorizationGrant.assetId, assetIds) : undefined, channelId ? eq(authorizationGrant.channelId, channelId) : undefined].filter(Boolean);
  if (subjects.length === 0) return [];
  const rows = await db
    .select()
    .from(authorizationGrant)
    .where(and(eq(authorizationGrant.workspaceId, workspaceId), or(...subjects)));
  return rows.map(toRightsGrant);
}

/** Every grant in a workspace, newest clock first (Settings → Rights). */
export async function listGrants(workspaceId: string): Promise<AuthorizationGrant[]> {
  return db.select().from(authorizationGrant).where(eq(authorizationGrant.workspaceId, workspaceId)).orderBy(authorizationGrant.createdAt);
}
