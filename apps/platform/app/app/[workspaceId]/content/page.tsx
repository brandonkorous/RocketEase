import type { Metadata } from "next";
import { Suspense } from "react";
import { and, desc, eq, ilike, inArray, isNull, ne, or, sql, count, lt, gt } from "drizzle-orm";
import { LibraryScreen, type AssetCard, type CollectionRow, type LibraryData } from "@/components/library-screen";
import { db } from "@/db";
import { user } from "@/db/schema/auth";
import { asset, assetRendition, folder, tag } from "@/db/schema/assets";
import { contentItem, postVariant } from "@/db/schema/content";
import { channel } from "@/db/schema/connections";
import { mediaJob } from "@/db/schema/media";
import { presignGet } from "@/lib/storage";
import { hasCapability, requireWorkspace } from "@/lib/session";
import { loadBrandKit } from "@/lib/brand/store";
import { canGenerate } from "@/lib/media/jobs";
import { imageUnitEstimate, videoUnitEstimate } from "@/lib/media/estimate";
import { recentGenerations } from "@/lib/media/recent";

export const metadata: Metadata = { title: "Content" };

const PAGE = 12;

type SP = { q?: string; tab?: string; folder?: string; smart?: string; sort?: string; page?: string; asset?: string; tag?: string };

export default async function ContentPage({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<SP> }) {
  const { workspaceId } = await params;
  const sp = await searchParams;
  const ctx = await requireWorkspace(workspaceId);
  const canEdit = hasCapability(ctx.workspace, "content.edit");
  const tz = ctx.workspace.timezone;

  const kit = await loadBrandKit(workspaceId);

  const [tags, folders] = await Promise.all([
    db.select().from(tag).where(eq(tag.workspaceId, workspaceId)).orderBy(tag.name),
    db.select().from(folder).where(eq(folder.workspaceId, workspaceId)).orderBy(folder.name),
  ]);
  const tagById = new Map(tags.map((t) => [t.id, t.name]));

  // Counts for tabs / rail.
  const live = and(eq(asset.workspaceId, workspaceId), isNull(asset.deletedAt));
  const [kindCounts, folderCounts, draftsCount, expiringCount, needsReviewCount] = await Promise.all([
    db.select({ kind: asset.kind, n: count() }).from(asset).where(live).groupBy(asset.kind),
    db.select({ folderId: asset.folderId, n: count() }).from(asset).where(live).groupBy(asset.folderId),
    db.select({ n: count() }).from(contentItem).where(and(eq(contentItem.workspaceId, workspaceId), isNull(contentItem.deletedAt), eq(contentItem.status, "draft"))),
    db.select({ n: count() }).from(asset).where(and(live, lt(asset.rightsExpiresAt, sql`now() + interval '30 days'`), gt(asset.rightsExpiresAt, sql`now() - interval '1 day'`))),
    db.select({ n: count() }).from(asset).where(and(live, or(isNull(asset.altText), eq(asset.altText, ""), ne(asset.scanStatus, "clean")))),
  ]);
  const total = kindCounts.reduce((a, r) => a + Number(r.n), 0);
  const nOf = (k: string) => Number(kindCounts.find((r) => r.kind === k)?.n ?? 0);

  // Usage: which assets are referenced by scheduled/published variants, per network.
  const usageRows = await db
    .select({ assetIds: contentItem.sharedAssetIds, override: postVariant.assetIdsOverride, network: channel.network, status: postVariant.status })
    .from(postVariant)
    .innerJoin(contentItem, eq(contentItem.id, postVariant.contentItemId))
    .innerJoin(channel, eq(channel.id, postVariant.channelId))
    .where(and(eq(postVariant.workspaceId, workspaceId), inArray(postVariant.status, ["scheduled", "publishing", "published"])));
  const usage = new Map<string, Record<string, number>>();
  for (const r of usageRows) for (const id of r.override ?? r.assetIds) {
    const m = usage.get(id) ?? {};
    m[r.network] = (m[r.network] ?? 0) + 1;
    usage.set(id, m);
  }

  // Filters.
  const where = [live];
  if (sp.tab === "images") where.push(eq(asset.kind, "image"));
  if (sp.tab === "videos") where.push(eq(asset.kind, "video"));
  if (sp.folder) where.push(eq(asset.folderId, sp.folder));
  if (sp.tag && tags.some((t) => t.name === sp.tag)) where.push(sql`${asset.tagIds} ? ${tags.find((t) => t.name === sp.tag)!.id}`);
  if (sp.q) where.push(or(ilike(asset.fileName, `%${sp.q}%`), ilike(asset.title, `%${sp.q}%`), ilike(asset.altText, `%${sp.q}%`), ilike(asset.caption, `%${sp.q}%`))!);
  if (sp.smart === "expiring") where.push(lt(asset.rightsExpiresAt, sql`now() + interval '30 days'`));
  if (sp.smart === "review") where.push(or(isNull(asset.altText), eq(asset.altText, ""), ne(asset.scanStatus, "clean"))!);
  if (sp.smart === "unused" && usage.size) where.push(sql`${asset.id} not in ${[...usage.keys()]}`);
  if (sp.smart === "used" && usage.size) where.push(inArray(asset.id, [...usage.keys()]));

  const page = Math.max(1, Number(sp.page ?? 1));
  const orderBy = sp.sort === "oldest" ? asset.createdAt : sp.sort === "name" ? asset.fileName : sp.sort === "size" ? desc(asset.bytes) : desc(asset.createdAt);
  const [{ n: matched }] = await db.select({ n: count() }).from(asset).where(and(...where));
  const rows = await db.select({ a: asset, uploader: user.name }).from(asset).leftJoin(user, eq(user.id, asset.uploadedByUserId)).where(and(...where)).orderBy(orderBy).limit(PAGE).offset((page - 1) * PAGE);

  const ids = rows.map((r) => r.a.id);
  const rends = ids.length ? await db.select().from(assetRendition).where(inArray(assetRendition.assetId, ids)) : [];

  // What each generated asset cost the CUSTOMER, in credits. Vendor dollars
  // stay off this screen — they are our cost of goods (docs/bugs/B-004).
  const jobIds = rows.map((r) => r.a.mediaJobId).filter((v): v is string => Boolean(v));
  const jobs = jobIds.length
    ? await db
        .select({ id: mediaJob.id, modelKey: mediaJob.modelKey, credits: mediaJob.credits, reason: mediaJob.modelReason })
        .from(mediaJob)
        .where(inArray(mediaJob.id, jobIds))
    : [];
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  /** null unless this asset came from a media job we can still resolve. */
  const generationOf = (a: typeof asset.$inferSelect): AssetCard["generation"] => {
    const job = a.mediaJobId ? jobById.get(a.mediaJobId) : null;
    if (!job) return a.generatedByAi ? { model: "AI-generated", credits: null, reason: null } : null;
    // numeric() comes back as a string; null stays null rather than becoming 0.
    return { model: job.modelKey, credits: job.credits === null ? null : Number(job.credits), reason: job.reason };
  };

  const toCard = async (a: typeof asset.$inferSelect, uploader: string | null): Promise<AssetCard> => {
    const thumb = rends.find((r) => r.assetId === a.id && r.kind === "thumb");
    const preview = rends.find((r) => r.assetId === a.id && r.kind === "preview");
    const ready = a.uploadStatus === "ready";
    return {
      id: a.id, kind: a.kind, fileName: a.fileName, title: a.title, altText: a.altText, caption: a.caption, mimeType: a.mimeType, bytes: a.bytes, width: a.width, height: a.height,
      durationSeconds: a.durationSeconds, uploadStatus: a.uploadStatus, scanStatus: a.scanStatus, scanNote: a.scanNote, processingError: a.processingError, rightsNote: a.rightsNote,
      rightsExpiresAt: a.rightsExpiresAt?.toISOString() ?? null, rightsScope: a.rightsScope, folderId: a.folderId, tags: a.tagIds.map((id) => tagById.get(id)).filter((n): n is string => Boolean(n)),
      thumbUrl: thumb ? await presignGet(thumb.storageKey) : ready && a.kind === "image" ? await presignGet(a.storageKey) : null,
      previewUrl: preview ? await presignGet(preview.storageKey) : null,
      originalUrl: ready ? await presignGet(a.storageKey, 3600, a.fileName) : null,
      renditions: rends.filter((r) => r.assetId === a.id).map((r) => ({ kind: r.kind, width: r.width, height: r.height, bytes: r.bytes })),
      usedIn: usage.get(a.id) ?? {},
      createdAt: a.createdAt.toISOString(), uploadedBy: uploader,
      generation: generationOf(a),
      referenceKind: a.referenceKind ?? null,
    };
  };
  const cards = await Promise.all(rows.map((r) => toCard(r.a, r.uploader)));

  // Selected asset may be outside the current page.
  let selected: AssetCard | null = cards.find((c) => c.id === sp.asset) ?? null;
  if (!selected && sp.asset) {
    const r = await db.select({ a: asset, uploader: user.name }).from(asset).leftJoin(user, eq(user.id, asset.uploadedByUserId)).where(and(eq(asset.id, sp.asset), live)).limit(1);
    if (r[0]) {
      const extra = await db.select().from(assetRendition).where(eq(assetRendition.assetId, r[0].a.id));
      rends.push(...extra);
      selected = await toCard(r[0].a, r[0].uploader);
    }
  }

  const recent = await db.select({ a: asset }).from(asset).where(live).orderBy(desc(asset.createdAt)).limit(5);
  const recentRends = recent.length ? await db.select().from(assetRendition).where(and(inArray(assetRendition.assetId, recent.map((r) => r.a.id)), eq(assetRendition.kind, "thumb"))) : [];
  const recentCards = await Promise.all(
    recent.map(async ({ a }) => ({ id: a.id, fileName: a.fileName, bytes: a.bytes, createdAt: a.createdAt.toISOString(), thumbUrl: (await (async () => { const t = recentRends.find((r) => r.assetId === a.id); return t ? presignGet(t.storageKey) : null; })()) })),
  );

  const collections: CollectionRow[] = folders.map((f) => ({ id: f.id, name: f.name, count: Number(folderCounts.find((c) => c.folderId === f.id)?.n ?? 0) }));

  const data: LibraryData = {
    workspaceId,
    timezone: tz,
    canEdit,
    canPublish: hasCapability(ctx.workspace, "content.publish") || ctx.workspace.role === "creator",
    tabs: { all: total, images: nOf("image"), videos: nOf("video"), drafts: Number(draftsCount[0]?.n ?? 0), templates: 0, copy: 0 },
    collections,
    smart: { expiring: Number(expiringCount[0]?.n ?? 0), review: Number(needsReviewCount[0]?.n ?? 0), unused: Math.max(0, total - usage.size), used: usage.size },
    assets: cards,
    // Needs no concept and no text model: the action checks canGenerate, not
    // aiConfigured, so this surface is independent of AI drafting entirely.
    imageGeneration: { enabled: canGenerate("scene_still"), estimate: await imageUnitEstimate(workspaceId) },
    videoGeneration: {
      enabled: canGenerate("hero_shot"),
      estimate: await videoUnitEstimate(workspaceId),
      // Only ready images: a reference that has not finished processing has no
      // bytes to send, and offering it would fail at the vendor.
      products: (
        await db
          .select({ id: asset.id, title: asset.title, fileName: asset.fileName })
          .from(asset)
          .where(and(live, eq(asset.referenceKind, "product"), eq(asset.kind, "image"), eq(asset.uploadStatus, "ready")))
          .orderBy(desc(asset.createdAt))
          .limit(24)
      ).map((r) => ({ id: r.id, label: r.title ?? r.fileName })),
    },
    // A job that fails has to be visible somewhere, and this is where the
    // toast told the person to look (docs/bugs/B-007).
    generations: await recentGenerations(workspaceId),
    selected,
    matched: Number(matched),
    page,
    pageSize: PAGE,
    recent: recentCards,
    allTags: tags.map((t) => t.name),
    brand: {
      logos: kit.visual.logos.length,
      palette: kit.visual.palette.slice(0, 6).map((c) => c.hex),
      fonts: [kit.visual.typography.headingFamily, kit.visual.typography.bodyFamily].filter(Boolean),
      assets: kit.assets.assetIds.length,
    },
    query: { q: sp.q ?? "", tab: sp.tab ?? "all", folder: sp.folder ?? "", smart: sp.smart ?? "", sort: sp.sort ?? "newest", tag: sp.tag ?? "" },
  };

  return (
    <Suspense>
      <LibraryScreen data={data} />
    </Suspense>
  );
}
