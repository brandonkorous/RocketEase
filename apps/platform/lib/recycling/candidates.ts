/*
 * Loads what `selectForOccurrence` needs: published items in a workspace plus
 * this rule's own reuse history. Asset rights are checked with the same
 * `mediaForAssets` the composer and the publish path use — there is no second
 * copy of the rules here.
 */
import { and, desc, eq, isNull, max, sql } from "drizzle-orm";
import { db } from "@/db";
import { contentItem, postVariant } from "@/db/schema/content";
import { recycleRun } from "@/db/schema/recycling";
import { mediaForAssets } from "@/lib/content";
import type { Candidate } from "./eligibility";

/** How many published items one rule considers per occurrence. */
const POOL = 40;

type Row = { id: string; title: string; tagIds: string[]; sharedAssetIds: string[]; publishedAt: Date | null; channelIds: string[] };

async function publishedItems(workspaceId: string): Promise<Row[]> {
  return db
    .select({
      id: contentItem.id,
      title: contentItem.title,
      tagIds: contentItem.tagIds,
      sharedAssetIds: contentItem.sharedAssetIds,
      publishedAt: max(postVariant.publishedAt),
      channelIds: sql<string[]>`array_agg(distinct ${postVariant.channelId})`,
    })
    .from(contentItem)
    .innerJoin(postVariant, eq(postVariant.contentItemId, contentItem.id))
    .where(and(eq(contentItem.workspaceId, workspaceId), isNull(contentItem.deletedAt), isNull(contentItem.recycledFromItemId), eq(postVariant.status, "published")))
    .groupBy(contentItem.id)
    .orderBy(desc(max(postVariant.publishedAt)))
    .limit(POOL);
}

/** First blocking problem with this item's media, in the words the composer uses. */
async function assetBlock(assetIds: string[]): Promise<string | null> {
  if (assetIds.length === 0) return null;
  const { problems } = await mediaForAssets(assetIds);
  return problems.find((p) => p.severity === "error")?.message ?? null;
}

/** Published items this rule could reuse, with its own repeat history attached. */
export async function candidatesForRule(workspaceId: string, ruleId: string): Promise<Candidate[]> {
  const rows = await publishedItems(workspaceId);
  if (rows.length === 0) return [];
  const history = await db
    .select({ sourceItemId: recycleRun.sourceItemId, repeats: sql<number>`count(*)`, lastAt: max(recycleRun.createdAt) })
    .from(recycleRun)
    .where(and(eq(recycleRun.ruleId, ruleId), sql`${recycleRun.newItemId} is not null`))
    .groupBy(recycleRun.sourceItemId);
  const byItem = new Map(history.map((h) => [h.sourceItemId, h]));
  return Promise.all(
    rows.map(async (r) => {
      const h = byItem.get(r.id);
      return {
        itemId: r.id,
        title: r.title,
        publishedAt: r.publishedAt,
        tagIds: r.tagIds,
        channelIds: r.channelIds ?? [],
        repeats: Number(h?.repeats ?? 0),
        lastRecycledAt: h?.lastAt ?? null,
        blockedAssetReason: await assetBlock(r.sharedAssetIds),
      };
    }),
  );
}
