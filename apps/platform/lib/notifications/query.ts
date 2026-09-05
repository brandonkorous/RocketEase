import "server-only";
import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { notification } from "@/db/schema/app";
import type { WorkspaceContext } from "@/lib/session";
import { KINDS, TABS, kindsForTab, specFor, type NotificationKind, type TabKey } from "./catalog";
import { PAGE_SIZE, groupByDay, paging, whenLabel, type DayBucket, type Paging } from "./present";

export type NotificationRowView = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  when: string;
  createdAt: Date;
};

export type NotificationsView = {
  workspaceId: string;
  tab: TabKey;
  tabs: { key: TabKey; label: string; definition: string; count: number }[];
  unread: number;
  totalAll: number;
  groups: { bucket: DayBucket; rows: NotificationRowView[] }[];
  paging: Paging;
};

export const isTab = (v: string | undefined): v is TabKey => TABS.some((t) => t.key === v);

/** One grouped query gives every tab its count; tabs overlap by kind, so counts are summed per tab. */
async function counts(userId: string, workspaceId: string) {
  const rows = await db
    .select({ kind: notification.kind, total: count(), unread: sql<number>`count(*) filter (where ${notification.readAt} is null)` })
    .from(notification)
    .where(and(eq(notification.userId, userId), eq(notification.workspaceId, workspaceId)))
    .groupBy(notification.kind);
  const byKind = new Map(rows.map((r) => [r.kind, { total: Number(r.total), unread: Number(r.unread) }]));
  const totalAll = [...byKind.values()].reduce((s, v) => s + v.total, 0);
  const unread = [...byKind.values()].reduce((s, v) => s + v.unread, 0);
  const forTab = (tab: TabKey) => {
    if (tab === "all") return totalAll;
    if (tab === "unread") return unread;
    return KINDS.filter((k) => k.tabs.includes(tab)).reduce((s, k) => s + (byKind.get(k.kind)?.total ?? 0), 0);
  };
  return { totalAll, unread, forTab };
}

export async function loadNotifications(ctx: WorkspaceContext, q: { tab?: string; page?: string }, now = new Date()): Promise<NotificationsView> {
  const userId = ctx.session.user.id;
  const workspaceId = ctx.workspace.id;
  const tab: TabKey = isTab(q.tab) ? q.tab : "all";
  const tz = ctx.workspace.timezone;
  const { totalAll, unread, forTab } = await counts(userId, workspaceId);
  const kinds = kindsForTab(tab);
  const where = and(
    eq(notification.userId, userId),
    eq(notification.workspaceId, workspaceId),
    tab === "unread" ? isNull(notification.readAt) : undefined,
    kinds ? inArray(notification.kind, kinds) : undefined,
  );
  const pg = paging(forTab(tab), Number(q.page ?? 1));
  const rows = await db.select().from(notification).where(where).orderBy(desc(notification.createdAt), desc(notification.id)).limit(PAGE_SIZE).offset((pg.page - 1) * PAGE_SIZE);
  // A kind this build no longer knows still shows, as plain text, rather than vanishing.
  const views: NotificationRowView[] = rows.map((r) => ({ id: r.id, kind: (specFor(r.kind)?.kind ?? "report.ready") as NotificationKind, title: r.title, body: r.body, href: r.href, read: Boolean(r.readAt), when: whenLabel(r.createdAt, now, tz), createdAt: r.createdAt }));
  return {
    workspaceId,
    tab,
    tabs: TABS.map((t) => ({ ...t, count: forTab(t.key) })),
    unread,
    totalAll,
    groups: groupByDay(views, now, tz),
    paging: pg,
  };
}
