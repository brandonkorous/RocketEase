/*
 * "Use in Create": a concept becomes an ordinary draft. Same row, same
 * validation, same audit as a post typed by hand — the generator gets no
 * shortcut, and nothing here schedules or publishes anything.
 */
import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { asset } from "@/db/schema/assets";
import { contentItem, postVariant } from "@/db/schema/content";
import { createContentItem, ownedAssetIds, type Actor } from "@/lib/authoring";
import { conceptText, type ConceptWire } from "./types";

const title = (c: ConceptWire) => {
  const line = (c.hook || c.body).replace(/\s+/g, " ").trim();
  return line ? line.slice(0, 80) : "Generated post";
};

/** Alt text the model suggested lands on generated images that have none yet. */
async function applyAltText(workspaceId: string, assetIds: string[], altText: string) {
  for (const id of assetIds) {
    await db
      .update(asset)
      .set({ altText, updatedAt: new Date() })
      .where(and(eq(asset.id, id), eq(asset.workspaceId, workspaceId), isNull(asset.altText)));
  }
}

/** Anything AI-drafted is at least "assisted"; a generated image makes it synthetic. */
const syntheticFor = (c: ConceptWire, userId: string) => ({
  flag: c.syntheticMedia ? ("synthetic_media" as const) : ("assisted" as const),
  note: c.syntheticMedia ? "Image generated with AI." : "Copy drafted with AI.",
  setBy: userId,
  setAt: new Date().toISOString(),
});

export async function draftFromConcept(actor: Actor, c: ConceptWire, requestedAssetIds: string[] = []): Promise<{ itemId: string }> {
  const assetIds = await ownedAssetIds(actor.workspaceId, requestedAssetIds);
  const { item } = await createContentItem(
    actor,
    { title: title(c), text: conceptText(c), assetIds, channelIds: [c.channelId] },
    "generator",
  );

  await db.update(contentItem).set({ syntheticMedia: syntheticFor(c, actor.userId), updatedAt: new Date() }).where(eq(contentItem.id, item.id));
  if (c.firstComment) {
    await db
      .update(postVariant)
      .set({ firstComment: c.firstComment, updatedAt: new Date() })
      .where(and(eq(postVariant.contentItemId, item.id), eq(postVariant.channelId, c.channelId)));
  }
  if (c.altText && assetIds.length) await applyAltText(actor.workspaceId, assetIds, c.altText);
  return { itemId: item.id };
}
