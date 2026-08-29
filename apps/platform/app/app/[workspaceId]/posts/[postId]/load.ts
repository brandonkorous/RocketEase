import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { comment } from "@/db/schema/approvals";
import { asset, assetRendition } from "@/db/schema/assets";
import { user } from "@/db/schema/auth";
import { contentVersion, remotePublication, type ContentItem, type PostVariant, type PublishJobRow } from "@/db/schema/content";
import type { CommentRow } from "@/components/post-comments";
import { buildReceipt, type PublishReceipt } from "@/lib/publishing/receipt";
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

/** Publish receipts for every destination: variant state + jobs + what the nightly reconcile saw. */
export async function loadReceipts(item: ContentItem, rows: { v: PostVariant; ch: { name: string; network: string } }[], jobs: PublishJobRow[]): Promise<PublishReceipt[]> {
  const ids = rows.map((r) => r.v.id);
  const [pubs, approval] = await Promise.all([
    ids.length ? db.select().from(remotePublication).where(inArray(remotePublication.variantId, ids)) : Promise.resolve([]),
    db.query.approvalRequest.findFirst({
      where: (r, { and, eq }) => and(eq(r.contentItemId, item.id), eq(r.state, "approved")),
      orderBy: (r, { desc }) => desc(r.decidedAt),
    }),
  ]);
  return rows.map(({ v, ch }) =>
    buildReceipt({
      variant: v,
      channel: ch,
      jobs: jobs.filter((j) => j.variantId === v.id),
      approvedAt: item.approvalState === "approved" ? (approval?.decidedAt ?? null) : null,
      publication: pubs.find((p) => p.variantId === v.id) ?? null,
    }),
  );
}
