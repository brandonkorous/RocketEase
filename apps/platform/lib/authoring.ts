/*
 * Content authoring core: create an item with its per-channel variants.
 * Shared by the composer's server actions and the public API, so a draft made
 * by an agent is the same row a person would have made — same validation,
 * same audit, same states.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { ValidationIssue } from "@rocketease/providers";
import { db } from "@/db";
import { asset } from "@/db/schema/assets";
import { channel } from "@/db/schema/connections";
import { contentItem, postVariant, type ContentItem, type PostVariant } from "@/db/schema/content";
import { audit } from "@/lib/audit";
import { track } from "@/lib/telemetry";
import { inferFormat, summarizeItem, validateVariant } from "@/lib/content";
import { deriveTitle } from "@/lib/content-title";

export type Actor = { userId: string; organizationId: string; workspaceId: string };

export type NewItemInput = {
  title?: string;
  text?: string;
  assetIds?: string[];
  link?: string | null;
  channelIds?: string[];
  /** Intent only — the variant stays a draft until someone schedules or approves it. */
  scheduledAt?: Date | null;
  /** Idempotency-Key from the public API; null for the UI. */
  apiIdempotencyKey?: string | null;
};

export type NewItemResult = {
  item: ContentItem;
  variants: PostVariant[];
  /** Validation issues per channel id, exactly as the composer shows them. */
  problems: Record<string, ValidationIssue[]>;
};

/** Assets that really belong to this workspace, order preserved. */
export async function ownedAssetIds(workspaceId: string, ids: string[]) {
  if (!ids.length) return [];
  const rows = await db.select({ id: asset.id }).from(asset).where(and(inArray(asset.id, ids), eq(asset.workspaceId, workspaceId)));
  const ok = new Set(rows.map((a) => a.id));
  return ids.filter((id) => ok.has(id));
}

/** Channels in this workspace that may still be posted to; unknown ids are rejected by the caller. */
async function resolveChannels(workspaceId: string, ids: string[]) {
  if (!ids.length) return [];
  return db
    .select({ id: channel.id, name: channel.name })
    .from(channel)
    .where(and(eq(channel.workspaceId, workspaceId), inArray(channel.id, ids), inArray(channel.status, ["healthy", "degraded", "syncing", "action_required"])));
}

/** An existing item created earlier with the same Idempotency-Key, if any. */
export async function itemByIdempotencyKey(workspaceId: string, key: string) {
  return db.query.contentItem.findFirst({ where: (c, { and, eq }) => and(eq(c.workspaceId, workspaceId), eq(c.apiIdempotencyKey, key)) });
}

/**
 * Creates the item and one variant per channel, then validates each variant
 * against that channel's live capabilities. Never publishes anything.
 */
export async function createContentItem(actor: Actor, input: NewItemInput, surface: string): Promise<NewItemResult> {
  const channelIds = [...new Set(input.channelIds ?? [])];
  const live = await resolveChannels(actor.workspaceId, channelIds);
  const unknown = channelIds.filter((id) => !live.some((c) => c.id === id));
  if (unknown.length) throw new UnknownChannelError(unknown);
  const assetIds = await ownedAssetIds(actor.workspaceId, input.assetIds ?? []);
  const assetRows = assetIds.length ? await db.select({ id: asset.id, kind: asset.kind }).from(asset).where(and(inArray(asset.id, assetIds), isNull(asset.deletedAt))) : [];

  const item = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(contentItem)
      .values({
        organizationId: actor.organizationId,
        workspaceId: actor.workspaceId,
        title: input.title?.trim() || deriveTitle(input.text ?? ""),
        sharedText: input.text ?? "",
        sharedAssetIds: assetIds,
        link: input.link ?? null,
        apiIdempotencyKey: input.apiIdempotencyKey ?? null,
        ownerUserId: actor.userId,
        createdByUserId: actor.userId,
      })
      .returning();
    for (const c of live) {
      await tx.insert(postVariant).values({
        organizationId: actor.organizationId,
        workspaceId: actor.workspaceId,
        contentItemId: row.id,
        channelId: c.id,
        format: inferFormat(assetRows),
        scheduledAt: input.scheduledAt ?? null,
      });
    }
    return row;
  });

  const variants = await db.select().from(postVariant).where(eq(postVariant.contentItemId, item.id));
  const problems: Record<string, ValidationIssue[]> = {};
  for (const v of variants) problems[v.channelId] = (await validateVariant(item, v)).issues;
  await summarizeItem(item.id);
  await audit({ action: "content.create", actorUserId: actor.userId, organizationId: actor.organizationId, workspaceId: actor.workspaceId, targetType: "content_item", targetId: item.id, summary: { after: { channels: live.map((c) => c.id), surface } } });
  await track("draft_created", { userId: actor.userId, organizationId: actor.organizationId, workspaceId: actor.workspaceId, surface, props: { channels: live.length } });
  const fresh = (await db.query.contentItem.findFirst({ where: (c, { eq }) => eq(c.id, item.id) })) ?? item;
  return { item: fresh, variants, problems };
}

export class UnknownChannelError extends Error {
  readonly channelIds: string[];
  constructor(channelIds: string[]) {
    super(`Unknown or unusable channel: ${channelIds.join(", ")}`);
    this.name = "UnknownChannelError";
    this.channelIds = channelIds;
  }
}
