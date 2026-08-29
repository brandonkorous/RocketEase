import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { workspace } from "@/db/schema/app";
import { recycleRule, type RecycleRule } from "@/db/schema/recycling";
import { readRecycling } from "@/lib/actions/settings/catalog";
import { occurrenceFor } from "@/lib/recycling/eligibility";
import { runOccurrence } from "@/lib/recycling/run";
import { dayKey, zonedToUtc } from "@/lib/time";
import type { JobPayloads } from "@/lib/jobs/queues";
import type { HandlerContext } from "./index";

const DAY = 86_400_000;
/** How long after its slot a rule may still fire; past that the day is simply missed. */
const GRACE_MS = 12 * 3_600_000;
/** Auto-scheduled copies get a short runway so a person can still catch them. */
const RUNWAY_MS = 15 * 60_000;

type Ws = { id: string; timezone: string; settings: Record<string, unknown> };

/** Today's slot for this rule, and whether it is due right now. */
function slotFor(rule: RecycleRule, tz: string, now: Date) {
  const occurrence = occurrenceFor(dayKey(now, tz), rule.atTime);
  const at = zonedToUtc(occurrence, tz);
  const since = now.getTime() - at.getTime();
  const cadenceMet = !rule.lastRunAt || now.getTime() - rule.lastRunAt.getTime() >= rule.everyDays * DAY;
  return { occurrence, at, due: since >= 0 && since < GRACE_MS && cadenceMet };
}

/**
 * Hourly evergreen recycling pass. Everything that makes it idempotent lives in
 * `recycle_run`: one row per (rule, occurrence), written before any content
 * exists, so a redelivered tick can only lose the race.
 */
export async function recycleTick(data: JobPayloads["recycle.tick"], ctx: HandlerContext) {
  const now = new Date();
  const rules = await db
    .select({ rule: recycleRule, ws: { id: workspace.id, timezone: workspace.timezone, settings: workspace.settings } })
    .from(recycleRule)
    .innerJoin(workspace, eq(workspace.id, recycleRule.workspaceId))
    .where(data.ruleId ? eq(recycleRule.id, data.ruleId) : data.workspaceId ? and(eq(recycleRule.enabled, true), eq(recycleRule.workspaceId, data.workspaceId)) : eq(recycleRule.enabled, true));

  for (const { rule, ws } of rules as { rule: RecycleRule; ws: Ws }[]) {
    if (ctx.signal.aborted) return;
    const slot = slotFor(rule, ws.timezone, now);
    if (!slot.due && !data.ruleId) continue;
    const scheduleAt = new Date(Math.max(slot.at.getTime(), now.getTime() + RUNWAY_MS));
    try {
      const r = await runOccurrence(rule, slot.occurrence, { autoSchedule: readRecycling(ws.settings).autoSchedule, scheduleAt, now });
      ctx.log.info("recycle tick", { ruleId: rule.id, workspaceId: ws.id, occurrence: slot.occurrence, outcome: r.outcome, reason: r.reason });
    } catch (err) {
      ctx.log.error("recycle rule failed", { ruleId: rule.id, workspaceId: ws.id, err });
    }
  }
}
