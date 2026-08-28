"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { contentItem } from "@/db/schema/content";
import { requireCapability } from "@/lib/session";
import { utcToZonedInput } from "@/lib/time";
import { rescheduleItem } from "./scheduling";
import { fail, guard, type ActionState } from "./shared";

const schema = z.object({ workspaceId: z.string().min(1), itemIds: z.array(z.string().min(1)).min(1).max(100), days: z.number().int().min(-365).max(365), hours: z.number().int().min(-23).max(23) });
export type BulkShiftInput = z.input<typeof schema>;
export type BulkResult = ActionState & { results?: { itemId: string; title: string; ok: boolean; message: string }[] };

/**
 * Shift many scheduled posts by the same offset. Each item goes through
 * `rescheduleItem` so validation, job re-enqueue, and audit apply per item
 * (flows.md "Destructive and bulk actions": per-item results).
 */
export async function bulkShiftSchedule(input: BulkShiftInput): Promise<BulkResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fail("Choose at least one post and an offset.");
  const { workspaceId, itemIds, days, hours } = parsed.data;
  if (days === 0 && hours === 0) return fail("Enter a non-zero offset.");
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "content.publish", { policyAllows: true });
    const items = await db.select({ id: contentItem.id, title: contentItem.title, scheduledAt: contentItem.scheduledAt }).from(contentItem).where(and(eq(contentItem.workspaceId, workspaceId), inArray(contentItem.id, itemIds), isNull(contentItem.deletedAt)));
    const offsetMs = (days * 24 + hours) * 3_600_000;
    const results: NonNullable<BulkResult["results"]> = [];
    for (const it of items) {
      if (!it.scheduledAt) { results.push({ itemId: it.id, title: it.title, ok: false, message: "Not scheduled." }); continue; }
      const whenLocal = utcToZonedInput(new Date(it.scheduledAt.getTime() + offsetMs), ctx.workspace.timezone);
      const r = await rescheduleItem(workspaceId, it.id, whenLocal);
      results.push({ itemId: it.id, title: it.title, ok: !r.error, message: r.error ?? r.ok ?? "Moved." });
    }
    const moved = results.filter((r) => r.ok).length;
    if (moved === 0) return { error: results[0]?.message ?? "Nothing moved.", results };
    return { ok: `Moved ${moved} of ${results.length} post${results.length === 1 ? "" : "s"}.`, results };
  });
}
