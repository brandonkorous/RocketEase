/*
 * Import source storage: sealed credentials and a token that is valid when
 * handed out. A Canva refresh token is single-use, so the refresh runs under a
 * row lock and the new pair is written before anyone else can read the old
 * one. Worker-safe (no server-only / next/headers).
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { importSource, type ImportKind, type ImportSource } from "@/db/schema/imports";
import { decryptJson, encryptJson } from "@/lib/crypto";
import { canvaAppConfig, refreshCanvaToken, type CanvaCredential } from "./canva";

/** Bound to the row id (AAD) so an envelope cannot be moved between sources. */
export const sealImportSecret = (sourceId: string, cred: CanvaCredential) => encryptJson(cred, `import:${sourceId}`);
export function openImportSecret(source: ImportSource): CanvaCredential {
  if (!source.secret) throw new Error(`Import source ${source.id} has no credential`);
  return decryptJson<CanvaCredential>(source.secret, `import:${source.id}`);
}

/** A person's own connected source of this kind in this workspace, or null. */
export async function ownSource(workspaceId: string, userId: string, kind: ImportKind = "canva"): Promise<ImportSource | null> {
  const row = await db.query.importSource.findFirst({ where: (s, { and, eq }) => and(eq(s.workspaceId, workspaceId), eq(s.kind, kind), eq(s.createdByUserId, userId), eq(s.status, "healthy")) });
  return row ?? null;
}

const REFRESH_AHEAD_MS = 2 * 60_000;

/**
 * An access token good for at least two minutes. When the stored one is about
 * to lapse, the row is locked, refreshed, and rewritten; a refresh Canva refuses
 * marks the source as needing attention and the person has to reconnect.
 */
export async function accessTokenFor(sourceId: string): Promise<string> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(importSource).where(eq(importSource.id, sourceId)).for("update");
    if (!row || row.status !== "healthy") throw new Error("Canva is not connected. Connect it again from the library.");
    const cred = openImportSecret(row);
    if (Date.parse(cred.expiresAt) - Date.now() > REFRESH_AHEAD_MS) return cred.accessToken;
    const cfg = canvaAppConfig();
    if (!cfg) throw new Error("Canva import is not configured on this server.");
    try {
      const fresh = await refreshCanvaToken(cfg, cred.refreshToken);
      await tx.update(importSource).set({ secret: sealImportSecret(row.id, fresh), scopes: fresh.scopes.length ? fresh.scopes : row.scopes, health: { ok: true, lastCheckedAt: new Date().toISOString() }, lastError: null, updatedAt: new Date() }).where(eq(importSource.id, row.id));
      return fresh.accessToken;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Canva refused to refresh the connection.";
      await tx.update(importSource).set({ status: "action_required", health: { ok: false, message, lastCheckedAt: new Date().toISOString() }, lastError: message, updatedAt: new Date() }).where(eq(importSource.id, row.id));
      throw new Error(`Canva needs to be connected again: ${message}`);
    }
  });
}

/** Drop rows a person left half-connected before starting a new consent. */
export async function clearPendingSources(workspaceId: string, userId: string, kind: ImportKind) {
  await db.delete(importSource).where(and(eq(importSource.workspaceId, workspaceId), eq(importSource.kind, kind), eq(importSource.createdByUserId, userId), sql`${importSource.status} in ('connecting', 'action_required', 'disconnected')`));
}
