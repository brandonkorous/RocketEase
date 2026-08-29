/*
 * Read model for Settings → Recycling. Degrades to empty until the migration
 * lands, so the rest of Settings keeps rendering.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { tag } from "@/db/schema/assets";
import { channel } from "@/db/schema/connections";
import { contentItem } from "@/db/schema/content";
import { recycleRule, recycleRun, type RecycleOutcome } from "@/db/schema/recycling";
import { formatInZone } from "@/lib/time";

export type RecycleRuleRow = { id: string; name: string; enabled: boolean; tagIds: string[]; channelIds: string[]; everyDays: number; atTime: string; maxRepeatsPerItem: number; pauseUntilDay: string | null; lastRun: string | null; runCount: number };
export type RecycleRunRow = { id: string; ruleId: string; outcome: RecycleOutcome; occurrence: string; reason: string | null; newItemId: string | null; newItemTitle: string | null; at: string };
export type RecycleOptions = { tags: { id: string; name: string }[]; channels: { id: string; name: string; network: string }[] };
export type RecyclingData = { rules: RecycleRuleRow[]; runs: RecycleRunRow[]; options: RecycleOptions; autoSchedule: boolean };

export const EMPTY_RECYCLING: RecyclingData = { rules: [], runs: [], options: { tags: [], channels: [] }, autoSchedule: false };

async function tolerate<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

const RUN_LIMIT = 60;

export async function recyclingData(workspaceId: string, timezone: string, autoSchedule: boolean): Promise<RecyclingData> {
  const options = await tolerate(async () => ({
    tags: await db.select({ id: tag.id, name: tag.name }).from(tag).where(eq(tag.workspaceId, workspaceId)).orderBy(tag.name),
    channels: await db.select({ id: channel.id, name: channel.name, network: channel.network }).from(channel).where(and(eq(channel.workspaceId, workspaceId), inArray(channel.status, ["healthy", "degraded", "syncing", "action_required"]))).orderBy(channel.name),
  }), EMPTY_RECYCLING.options);

  const ruleRows = await tolerate(() => db.select().from(recycleRule).where(eq(recycleRule.workspaceId, workspaceId)).orderBy(recycleRule.createdAt), [] as (typeof recycleRule.$inferSelect)[]);
  const at = (d: Date) => formatInZone(d, timezone, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const rules: RecycleRuleRow[] = ruleRows.map((r) => ({
    id: r.id, name: r.name, enabled: r.enabled, tagIds: r.tagIds, channelIds: r.channelIds, everyDays: r.everyDays, atTime: r.atTime,
    maxRepeatsPerItem: r.maxRepeatsPerItem, pauseUntilDay: r.pauseUntil?.toISOString().slice(0, 10) ?? null,
    lastRun: r.lastRunAt ? at(r.lastRunAt) : null, runCount: r.runCount,
  }));

  const runRows = rules.length
    ? await tolerate(
        () => db.select({ r: recycleRun, title: contentItem.title }).from(recycleRun).leftJoin(contentItem, eq(contentItem.id, recycleRun.newItemId)).where(eq(recycleRun.workspaceId, workspaceId)).orderBy(desc(recycleRun.createdAt)).limit(RUN_LIMIT),
        [] as { r: typeof recycleRun.$inferSelect; title: string | null }[],
      )
    : [];
  const runs: RecycleRunRow[] = runRows.map(({ r, title }) => ({ id: r.id, ruleId: r.ruleId, outcome: r.outcome, occurrence: r.occurrence, reason: r.reason, newItemId: r.newItemId, newItemTitle: title, at: at(r.createdAt) }));
  return { rules, runs, options, autoSchedule };
}
