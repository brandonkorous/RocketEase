import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { comment } from "@/db/schema/approvals";
import { asset, assetRendition } from "@/db/schema/assets";
import { user } from "@/db/schema/auth";
import { contentVersion, type ContentItem, type PostVariant } from "@/db/schema/content";
import type { CommentRow } from "@/components/post-comments";
import { presignGet } from "@/lib/storage";
import { formatInZone } from "@/lib/time";

/** Comment thread with author names and the version each comment was left on. */
export async function loadComments(itemId: string, viewerId: string, tz: string): Promise<CommentRow[]> {
  const rows = await db
    .select({ c: comment, by: user.name, image: user.image, vnum: contentVersion.number })
    .from(comment)
    .leftJoin(user, eq(user.id, comment.authorUserId))
    .leftJoin(contentVersion, eq(contentVersion.id, comment.versionId))
    .where(eq(comment.contentItemId, itemId))
    .orderBy(comment.createdAt);
  return rows.map((c) => ({
    id: c.c.id, by: c.by ?? "—", image: c.image, body: c.c.body,
    at: formatInZone(c.c.createdAt, tz, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
    mine: c.c.authorUserId === viewerId, resolved: Boolean(c.c.resolvedAt), version: c.vnum,
  }));
}

export type Thumb = { id: string; url: string | null; alt: string };

/** Presigned thumbnails for the shared assets (renditions when they exist). */
export async function loadContent(item: ContentItem, variants: PostVariant[]): Promise<{ thumbs: Thumb[] }> {
  const ids = [...new Set([...item.sharedAssetIds, ...variants.flatMap((v) => v.assetIdsOverride ?? [])])];
  if (!ids.length) return { thumbs: [] };
  const assets = await db.select().from(asset).where(inArray(asset.id, ids));
  const renditions = assets.length ? await db.select().from(assetRendition).where(and(inArray(assetRendition.assetId, assets.map((a) => a.id)), eq(assetRendition.kind, "thumb"))) : [];
  const urlFor = async (id: string) => {
    const t = renditions.find((r) => r.assetId === id);
    if (t) return presignGet(t.storageKey);
    const a = assets.find((x) => x.id === id);
    return a?.kind === "image" ? presignGet(a.storageKey) : null;
  };
  const thumbs = await Promise.all(item.sharedAssetIds.map(async (id) => ({ id, url: await urlFor(id), alt: assets.find((a) => a.id === id)?.altText ?? "" })));
  return { thumbs };
}
