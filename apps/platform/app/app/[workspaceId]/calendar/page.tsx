import type { Metadata } from "next";
import { Suspense } from "react";
import { and, asc, count, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { CalendarScreen, type CalendarPost, type CalendarData } from "@/components/calendar-screen";
import { db } from "@/db";
import { asset, assetRendition } from "@/db/schema/assets";
import { contentItem, postVariant } from "@/db/schema/content";
import { channel } from "@/db/schema/connections";
import { buildReceipt, receiptChip } from "@/lib/publishing/receipt";
import { hasCapability, requireWorkspace } from "@/lib/session";
import { presignGet } from "@/lib/storage";
import { dayKey, utcToZonedInput, zonedToUtc } from "@/lib/time";

export const metadata: Metadata = { title: "Calendar" };

type SP = { view?: string; date?: string; status?: string; channel?: string };

function startOfWeek(dayIso: string) {
  const d = new Date(`${dayIso}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}
function addDays(dayIso: string, n: number) {
  const d = new Date(`${dayIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export default async function CalendarPage({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<SP> }) {
  const { workspaceId } = await params;
  const sp = await searchParams;
  const ctx = await requireWorkspace(workspaceId);
  const tz = ctx.workspace.timezone;
  const view = sp.view === "month" || sp.view === "list" ? sp.view : "week";
  const today = dayKey(new Date(), tz);
  const anchor = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;

  // Range in workspace-local days.
  let rangeStart: string, rangeEnd: string;
  if (view === "week") {
    rangeStart = startOfWeek(anchor);
    rangeEnd = addDays(rangeStart, 7);
  } else if (view === "month") {
    const first = `${anchor.slice(0, 7)}-01`;
    rangeStart = startOfWeek(first);
    const nextMonth = new Date(`${first}T00:00:00Z`);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    rangeEnd = addDays(startOfWeek(nextMonth.toISOString().slice(0, 10)), 7);
  } else {
    rangeStart = addDays(today, -7);
    rangeEnd = addDays(today, 60);
  }
  const startUtc = zonedToUtc(`${rangeStart}T00:00`, tz);
  const endUtc = zonedToUtc(`${rangeEnd}T00:00`, tz);

  const channels = await db.select().from(channel).where(and(eq(channel.workspaceId, workspaceId), inArray(channel.status, ["healthy", "degraded", "syncing", "action_required"]))).orderBy(channel.name);

  const where = [eq(postVariant.workspaceId, workspaceId), isNull(contentItem.deletedAt)];
  if (sp.channel) where.push(eq(postVariant.channelId, sp.channel));
  if (sp.status && ["draft", "scheduled", "published", "failed"].includes(sp.status)) where.push(eq(postVariant.status, sp.status as "draft"));
  const rows = await db
    .select({ v: postVariant, item: contentItem, ch: channel })
    .from(postVariant)
    .innerJoin(contentItem, eq(contentItem.id, postVariant.contentItemId))
    .innerJoin(channel, eq(channel.id, postVariant.channelId))
    .where(and(...where, view === "list" ? undefined : and(gte(postVariant.scheduledAt, startUtc), lte(postVariant.scheduledAt, endUtc))))
    .orderBy(asc(postVariant.scheduledAt), desc(contentItem.updatedAt))
    .limit(500);

  // Drafts without a time show in the list view / unscheduled tray.
  const unscheduled = await db
    .select({ item: contentItem })
    .from(contentItem)
    .where(and(eq(contentItem.workspaceId, workspaceId), isNull(contentItem.deletedAt), isNull(contentItem.scheduledAt), inArray(contentItem.status, ["draft", "in_review", "changes_requested", "approved"])))
    .orderBy(desc(contentItem.updatedAt))
    .limit(20);

  const assetIds = [...new Set(rows.flatMap((r) => (r.v.assetIdsOverride ?? r.item.sharedAssetIds).slice(0, 1)))];
  const thumbs = assetIds.length ? await db.select().from(assetRendition).where(and(inArray(assetRendition.assetId, assetIds), eq(assetRendition.kind, "thumb"))) : [];
  const originals = assetIds.length ? await db.select({ id: asset.id, key: asset.storageKey, kind: asset.kind }).from(asset).where(inArray(asset.id, assetIds)) : [];
  const thumbUrlFor = async (id?: string) => {
    if (!id) return null;
    const t = thumbs.find((r) => r.assetId === id);
    if (t) return presignGet(t.storageKey);
    const o = originals.find((a) => a.id === id);
    return o && o.kind === "image" ? presignGet(o.key) : null;
  };

  const posts: CalendarPost[] = await Promise.all(
    rows.map(async (r) => ({
      variantId: r.v.id,
      itemId: r.item.id,
      title: r.item.title,
      text: (r.v.textOverride ?? r.item.sharedText).slice(0, 140),
      status: r.v.status,
      itemStatus: r.item.status,
      approval: r.item.approvalState,
      channelId: r.ch.id,
      channelName: r.ch.name,
      network: r.ch.network,
      scheduledAt: r.v.scheduledAt?.toISOString() ?? null,
      localDay: r.v.scheduledAt ? dayKey(r.v.scheduledAt, tz) : null,
      localTime: r.v.scheduledAt ? utcToZonedInput(r.v.scheduledAt, tz).slice(11, 16) : null,
      thumbUrl: await thumbUrlFor((r.v.assetIdsOverride ?? r.item.sharedAssetIds)[0]),
      format: r.v.format,
      error: r.v.lastError?.message ?? null,
      recycled: Boolean(r.item.recycledFromItemId),
      receipt: receiptChip(buildReceipt({ variant: r.v, channel: { name: r.ch.name, network: r.ch.network } })),
    })),
  );

  const [stats] = await Promise.all([
    Promise.all(
      (["scheduled", "draft", "in_review", "changes_requested", "published"] as const).map(async (s) => {
        const [{ n }] = await db.select({ n: count() }).from(contentItem).where(and(eq(contentItem.workspaceId, workspaceId), isNull(contentItem.deletedAt), eq(contentItem.status, s)));
        return [s, Number(n)] as const;
      }),
    ),
  ]);
  const [{ n: failed }] = await db.select({ n: count() }).from(contentItem).where(and(eq(contentItem.workspaceId, workspaceId), isNull(contentItem.deletedAt), inArray(contentItem.status, ["failed", "partially_published"])));

  const data: CalendarData = {
    workspaceId,
    timezone: tz,
    today,
    anchor,
    view,
    rangeStart,
    rangeEnd,
    posts,
    unscheduled: unscheduled.map((u) => ({ itemId: u.item.id, title: u.item.title, status: u.item.status, text: u.item.sharedText.slice(0, 100), updatedAt: u.item.updatedAt.toISOString() })),
    channels: channels.map((c) => ({ id: c.id, name: c.name, network: c.network })),
    stats: { scheduled: stats.find(([k]) => k === "scheduled")?.[1] ?? 0, drafts: stats.find(([k]) => k === "draft")?.[1] ?? 0, underReview: stats.find(([k]) => k === "in_review")?.[1] ?? 0, needsChanges: stats.find(([k]) => k === "changes_requested")?.[1] ?? 0, published: stats.find(([k]) => k === "published")?.[1] ?? 0, failed: Number(failed) },
    canPublish: hasCapability(ctx.workspace, "content.publish") || ctx.workspace.role === "creator",
    canCreate: hasCapability(ctx.workspace, "content.create"),
    filters: { status: sp.status ?? "", channel: sp.channel ?? "" },
  };

  return (
    <Suspense>
      <CalendarScreen data={data} />
    </Suspense>
  );
}
