import "server-only";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { asset } from "@/db/schema/assets";
import { presignGet } from "@/lib/storage";
import type { AssetView, LogoView } from "./view-types";
import type { BrandKit } from "./types";

export type { AssetView, LogoView } from "./view-types";

/** Previews are presigned per request; a logo storage has lost is simply not shown. */
export async function logoViews(kit: BrandKit): Promise<LogoView[]> {
  const views = await Promise.all(
    kit.visual.logos.map(async (l) => {
      try {
        return { role: l.role, url: await presignGet(l.key, 3600), note: l.note };
      } catch {
        return null;
      }
    }),
  );
  return views.filter((v): v is LogoView => v !== null);
}

const LIBRARY_LIMIT = 24;

import type { RightsScope } from "@/db/schema/assets";

type Row = { id: string; title: string | null; fileName: string; storageKey: string; scope: RightsScope; expires: Date | null; width: number | null; height: number | null };

const toView = async (r: Row, today: Date): Promise<AssetView> => ({
  id: r.id,
  title: r.title ?? r.fileName,
  url: await presignGet(r.storageKey, 3600).catch(() => null),
  size: r.width && r.height ? `${r.width} × ${r.height}` : null,
  rights: `Rights: ${r.scope}`,
  expired: Boolean(r.expires && r.expires < today),
});

const columns = {
  id: asset.id, title: asset.title, fileName: asset.fileName, storageKey: asset.storageKey,
  scope: asset.rightsScope, expires: asset.rightsExpiresAt, width: asset.width, height: asset.height,
};

const ready = (workspaceId: string) => and(eq(asset.workspaceId, workspaceId), eq(asset.kind, "image"), eq(asset.uploadStatus, "ready"), isNull(asset.deletedAt));

/** The pool a brand asset is picked from: recent, ready images, marked ones first. */
export async function libraryCards(workspaceId: string, marked: string[], today: Date): Promise<AssetView[]> {
  const rows = await db.select(columns).from(asset).where(ready(workspaceId)).orderBy(desc(asset.createdAt)).limit(LIBRARY_LIMIT);
  const picked = new Set(marked);
  const ordered = [...rows].sort((a, b) => Number(picked.has(b.id)) - Number(picked.has(a.id)));
  return Promise.all(ordered.map((r) => toView(r, today)));
}

/** Just the assets flagged as brand assets, in the order they were marked. */
export async function brandAssetCards(workspaceId: string, ids: string[], today: Date): Promise<AssetView[]> {
  if (!ids.length) return [];
  const rows = await db.select(columns).from(asset).where(and(ready(workspaceId), inArray(asset.id, ids)));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = ids.map((id) => byId.get(id)).filter((r): r is Row => Boolean(r));
  return Promise.all(ordered.map((r) => toView(r, today)));
}
