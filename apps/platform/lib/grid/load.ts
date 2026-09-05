/*
 * Server loader for the Grid page: one channel, one surface, everything the
 * profile will show. Reads only what the sync and publish workers already wrote —
 * the page never calls a network.
 */
import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { reasonFor } from "@rocketease/providers/client";
import { db } from "@/db";
import { contentItem, postVariant, type PostVariant } from "@/db/schema/content";
import { channel } from "@/db/schema/connections";
import { hasCapability, type WorkspaceContext } from "@/lib/session";
import { presignGet } from "@/lib/storage";
import { dayKey, utcToZonedInput } from "@/lib/time";
import { coverSetting, framesForAsset } from "./cover";
import { GRID_NETWORKS, layoutFor, layoutsFor, type GridLayout, type GridNetwork } from "./layouts";
import { tileMedia } from "./load-thumbs";
import { buildTiles, daysAhead, findGaps, inferCadenceDays, postState, usualTime } from "./tiles";
import type { GridChannel, GridData, GridPost, GridSelected } from "./types";

export type GridQuery = { channel?: string; surface?: string; tile?: string };

/** Live posts older than this fall off the grid; the profile itself scrolls forever, the plan does not. */
export const LIVE_WINDOW_DAYS = 90;
const RHYTHM_SAMPLE = 10;

type Row = { v: PostVariant; item: typeof contentItem.$inferSelect };

export async function gridChannels(workspaceId: string): Promise<GridChannel[]> {
  const rows = await db.select().from(channel).where(and(eq(channel.workspaceId, workspaceId), inArray(channel.status, ["healthy", "degraded", "syncing", "action_required"]), inArray(channel.network, [...GRID_NETWORKS]))).orderBy(channel.name);
  return rows.map((c) => ({ id: c.id, name: c.name, handle: c.handle, avatarUrl: c.avatarUrl, network: c.network as GridNetwork }));
}

/** Null when the workspace has no profile a grid can show; the page renders its empty state. */
export async function loadGrid(ctx: WorkspaceContext, q: GridQuery): Promise<GridData | null> {
  const workspaceId = ctx.workspace.id;
  const tz = ctx.workspace.timezone;
  const channels = await gridChannels(workspaceId);
  const current = channels.find((c) => c.id === q.channel) ?? channels[0];
  if (!current) return null;
  const layout = layoutFor(current.network, q.surface);
  if (!layout) return null;

  const rows = await variantRows(workspaceId, current.id);
  const today = dayKey(new Date(), tz);
  const inView = rows.filter((r) => visible(r, today, tz));
  const surfaces = layoutsFor(current.network).map((l) => ({ key: l.surface, label: l.label, count: inView.filter((r) => l.formats.includes(r.v.format)).length }));
  const onSurface = inView.filter((r) => layout.formats.includes(r.v.format));
  const posts = await toPosts(onSurface, tz);

  const live = posts.filter((p) => p.state === "live");
  const planned = posts.filter((p) => p.state !== "live");
  const sample = live.slice(0, RHYTHM_SAMPLE);
  const cadenceDays = inferCadenceDays(sample.map((p) => p.localDay!));
  const time = usualTime(sample.map((p) => p.localTime!));
  const gaps = findGaps({ liveDays: live.map((p) => p.localDay!), plannedDays: planned.map((p) => p.localDay!), today, cadenceDays });

  const [drafts, selected] = await Promise.all([unscheduledDrafts(workspaceId, current.id), selectedFor(posts, q.tile, current.id)]);
  return {
    workspaceId, timezone: tz, today, channel: current, channels, surface: layout.surface, surfaces, layout,
    tiles: buildTiles(posts, gaps, time),
    stats: { live: live.length, planned: planned.length, gaps: gaps.length, daysAhead: daysAhead(planned.map((p) => p.at!).filter(Boolean), new Date()) },
    rhythm: { cadenceDays, usualTime: time, liveSample: sample.length },
    drafts,
    selected,
    canPublish: hasCapability(ctx.workspace, "content.publish") || ctx.workspace.role === "creator",
    canCreate: hasCapability(ctx.workspace, "content.create"),
  };
}

function variantRows(workspaceId: string, channelId: string): Promise<Row[]> {
  return db
    .select({ v: postVariant, item: contentItem })
    .from(postVariant)
    .innerJoin(contentItem, eq(contentItem.id, postVariant.contentItemId))
    .where(and(eq(postVariant.workspaceId, workspaceId), eq(postVariant.channelId, channelId), isNull(contentItem.deletedAt), ne(postVariant.status, "canceled")))
    .orderBy(desc(sql`coalesce(${postVariant.publishedAt}, ${postVariant.scheduledAt}, ${contentItem.scheduledAt})`))
    .limit(300);
}

/** The instant a tile sorts by: when it went live, else when it is planned for. */
const instantOf = (r: Row) => (r.v.status === "published" ? r.v.publishedAt : r.v.scheduledAt ?? r.item.scheduledAt) ?? null;

function visible(r: Row, today: string, tz: string): boolean {
  const at = instantOf(r);
  if (!at) return false;
  if (r.v.status !== "published") return true;
  const cutoff = new Date(`${today}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - LIVE_WINDOW_DAYS);
  return dayKey(at, tz) >= cutoff.toISOString().slice(0, 10);
}

async function toPosts(rows: Row[], tz: string): Promise<GridPost[]> {
  const firstAsset = (r: Row) => (r.v.assetIdsOverride ?? r.item.sharedAssetIds)[0];
  const covers = new Map<string, string>();
  for (const r of rows) {
    const c = coverSetting(r.v.settings);
    const a = firstAsset(r);
    if (c && a) covers.set(a, c.frameId);
  }
  const media = await tileMedia(rows.map(firstAsset).filter((id): id is string => Boolean(id)), covers);
  return rows.map((r) => {
    const at = instantOf(r)!;
    const local = utcToZonedInput(at, tz);
    const m = firstAsset(r) ? media.get(firstAsset(r)!) : undefined;
    return {
      kind: "post", key: r.v.id, itemId: r.item.id, variantId: r.v.id, title: r.item.title, text: (r.v.textOverride ?? r.item.sharedText).slice(0, 140), format: r.v.format,
      state: postState({ status: r.v.status, approvalState: r.item.approvalState, itemStatus: r.item.status }),
      localDay: local.slice(0, 10), localTime: local.slice(11, 16), at: at.toISOString(),
      thumbUrl: m?.thumbUrl ?? null, isVideo: m?.isVideo ?? false, remoteUrl: r.v.remoteUrl, videoAssetId: m?.videoAssetId ?? null, coverOffsetMs: coverSetting(r.v.settings)?.offsetMs ?? null,
    };
  });
}

/** Drafts with a variant on this channel and no date yet: what a gap can be filled with. */
async function unscheduledDrafts(workspaceId: string, channelId: string) {
  const rows = await db
    .select({ item: contentItem })
    .from(contentItem)
    .innerJoin(postVariant, eq(postVariant.contentItemId, contentItem.id))
    .where(and(eq(contentItem.workspaceId, workspaceId), eq(postVariant.channelId, channelId), isNull(contentItem.deletedAt), isNull(contentItem.scheduledAt), inArray(contentItem.status, ["draft", "in_review", "changes_requested", "approved"])))
    .orderBy(desc(contentItem.updatedAt))
    .limit(20);
  const seen = new Set<string>();
  return rows.filter((r) => !seen.has(r.item.id) && seen.add(r.item.id)).slice(0, 10).map((r) => ({ itemId: r.item.id, title: r.item.title, text: r.item.sharedText.slice(0, 100) }));
}

async function selectedFor(posts: GridPost[], variantId: string | undefined, channelId: string): Promise<GridSelected | null> {
  const post = posts.find((p) => p.variantId === variantId);
  if (!post) return null;
  const ch = await db.query.channel.findFirst({ where: (c, { eq }) => eq(c.id, channelId) });
  const caps = ch?.capabilities;
  const frames = post.videoAssetId ? await framesForAsset(post.videoAssetId) : [];
  return {
    post,
    frames: await Promise.all(frames.map(async (f) => ({ id: f.id, offsetMs: f.offsetMs, url: await presignGet(f.storageKey) }))),
    coverSupport: caps?.cover ?? "none",
    coverReason: caps ? (reasonFor(caps, "cover") ?? null) : null,
  };
}

export type { GridLayout };
