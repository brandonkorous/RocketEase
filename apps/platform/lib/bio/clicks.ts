/*
 * Click counting. One row per click, written on the way out (the redirect
 * route), recounted on every read. Nothing is deduplicated and nothing is
 * estimated: a link nobody opened reads 0 because there are 0 rows.
 */
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { bioLinkClick, type BioLink } from "@/db/schema/bio";
import { dayKey } from "@/lib/time";
import { CLICK_WINDOW_DAYS } from "./rules";

export type ClickCounts = { week: number; all: number };

/** Per-link counts for one page: all time, and the rolling last 7 × 24 hours. */
export async function clickCounts(pageId: string, now = new Date()): Promise<Map<string, ClickCounts>> {
  const since = new Date(now.getTime() - CLICK_WINDOW_DAYS * 86_400_000);
  const rows = await db
    // A Date must be passed as text: postgres-js cannot encode a Date bound inside a raw sql`` fragment.
    .select({ linkId: bioLinkClick.linkId, all: sql<number>`count(*)`, week: sql<number>`count(*) filter (where ${bioLinkClick.occurredAt} >= ${since.toISOString()}::timestamptz)` })
    .from(bioLinkClick)
    .where(eq(bioLinkClick.pageId, pageId))
    .groupBy(bioLinkClick.linkId);
  return new Map(rows.map((r) => [r.linkId, { week: Number(r.week), all: Number(r.all) }]));
}

/** Total clicks on a page since a moment — the Home/overview number. */
export async function clicksSince(pageId: string, since: Date): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(bioLinkClick).where(and(eq(bioLinkClick.pageId, pageId), gte(bioLinkClick.occurredAt, since)));
  return Number(row?.n ?? 0);
}

export async function recordClick(link: Pick<BioLink, "id" | "pageId" | "workspaceId" | "organizationId">, timezone: string, now = new Date()) {
  await db.insert(bioLinkClick).values({ organizationId: link.organizationId, workspaceId: link.workspaceId, pageId: link.pageId, linkId: link.id, occurredAt: now, day: dayKey(now, timezone) });
}
