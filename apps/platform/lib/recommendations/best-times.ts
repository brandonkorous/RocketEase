/*
 * Persistence and reads for best-time slots. The scoring itself is pure and
 * lives in ./slots so it can be unit-tested without a database.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { bestTimeSlot } from "@/db/schema/recommendations";
import { log } from "@/lib/log";
import type { ComputedSlot } from "./slots";
import type { SlotView } from "./slot-format";

export { computeSlots, MIN_POSTS_PER_CHANNEL, type ComputedSlot } from "./slots";

/** Replace a channel's stored slots with what this run computed (delete + insert in one tx). */
export async function saveSlots(organizationId: string, workspaceId: string, channelId: string, slots: ComputedSlot[]) {
  await db.transaction(async (tx) => {
    await tx.delete(bestTimeSlot).where(eq(bestTimeSlot.channelId, channelId));
    if (!slots.length) return;
    await tx.insert(bestTimeSlot).values(slots.map((s) => ({ organizationId, workspaceId, channelId, weekday: s.weekday, hour: s.hour, score: String(s.score), sampleSize: s.sampleSize })));
  });
}

export type BestTime = SlotView & { computedAt: Date };

/**
 * Top slots across the given channels, best first. Safe before the migration
 * exists (returns empty), which the composer renders as the honest placeholder.
 */
export async function loadBestTimes(workspaceId: string, channelIds: string[], limit = 3): Promise<BestTime[]> {
  if (!channelIds.length) return [];
  try {
    const rows = await db
      .select({ channelId: bestTimeSlot.channelId, weekday: bestTimeSlot.weekday, hour: bestTimeSlot.hour, score: bestTimeSlot.score, sampleSize: bestTimeSlot.sampleSize, computedAt: bestTimeSlot.computedAt })
      .from(bestTimeSlot)
      .where(and(eq(bestTimeSlot.workspaceId, workspaceId), inArray(bestTimeSlot.channelId, channelIds)))
      .orderBy(sql`${bestTimeSlot.score} desc`, sql`${bestTimeSlot.sampleSize} desc`)
      .limit(limit);
    return rows.map((r) => ({ ...r, score: Number(r.score) }));
  } catch (err) {
    log.warn("best times unavailable", { workspaceId, err });
    return [];
  }
}
