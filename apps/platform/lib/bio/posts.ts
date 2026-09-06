/*
 * The "latest posts" strip: the newest published variants of ONE connected
 * channel that have a picture, each linking to the live post. Nothing is
 * fetched from the network for this — it is what RocketEase itself published.
 */
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { contentItem, postVariant } from "@/db/schema/content";
import { tileMedia } from "@/lib/grid/load-thumbs";

export type BioPost = { url: string; thumbUrl: string; title: string };

export async function latestPosts(channelId: string, limit: number): Promise<BioPost[]> {
  const rows = await db
    .select({ url: postVariant.remoteUrl, override: postVariant.assetIdsOverride, shared: contentItem.sharedAssetIds, title: contentItem.title })
    .from(postVariant)
    .innerJoin(contentItem, eq(contentItem.id, postVariant.contentItemId))
    .where(and(eq(postVariant.channelId, channelId), eq(postVariant.status, "published"), isNotNull(postVariant.remoteUrl)))
    .orderBy(desc(postVariant.publishedAt))
    .limit(limit * 3);
  const withAsset = rows.map((r) => ({ ...r, assetId: (r.override ?? r.shared)[0] ?? null })).filter((r): r is typeof r & { assetId: string; url: string } => Boolean(r.assetId && r.url));
  const media = await tileMedia(withAsset.map((r) => r.assetId), new Map());
  const out: BioPost[] = [];
  for (const r of withAsset) {
    const thumb = media.get(r.assetId)?.thumbUrl;
    if (thumb) out.push({ url: r.url, thumbUrl: thumb, title: r.title });
    if (out.length === limit) break;
  }
  return out;
}
