import { ProviderError } from "@make-it-social/providers";
import { db } from "@/db";
import type { TrackingSource } from "@/db/schema/tracking";
import type { JobPayloads } from "@/lib/jobs/queues";
import { fetchRowsForSource, type Range } from "@/lib/tracking/fetch";
import { windowLabel } from "@/lib/tracking/labels";
import { dayStr } from "@/lib/tracking/normalize";
import { setSourceHealth, upsertConversionFacts } from "@/lib/tracking/sources";
import type { HandlerContext } from "./index";

const LOOKBACK_DAYS = 3; // GA4 and Shopify restate recent days; always re-pull a short tail
const INITIAL_DAYS = 28;

function windowFor(source: TrackingSource, since?: string): Range {
  const until = new Date();
  const from = since
    ? new Date(since)
    : source.lastSyncAt
      ? new Date(source.lastSyncAt.getTime() - LOOKBACK_DAYS * 86_400_000)
      : new Date(until.getTime() - INITIAL_DAYS * 86_400_000);
  return { since: dayStr(from), until: dayStr(until) };
}

/** A permission failure is the source's problem, not the job's: park it for the user to fix. */
async function degrade(source: TrackingSource, err: ProviderError) {
  await setSourceHealth(source.id, {
    status: "action_required",
    health: { ok: false, message: err.message, errorCategory: err.category, lastCheckedAt: new Date().toISOString(), hasRevenue: source.health.hasRevenue },
    lastError: `${err.category}: ${err.message}`,
  });
}

/** Import one tracking source's daily conversion facts (analytics.md "Campaign attribution"). */
export async function trackingSync(data: JobPayloads["tracking.sync"], ctx: HandlerContext) {
  const source = await db.query.trackingSource.findFirst({ where: (s, { eq }) => eq(s.id, data.sourceId) });
  if (!source || source.disconnectedAt || source.status === "connecting") return;
  const l = ctx.log.child({ trackingSourceId: source.id, kind: source.kind });
  const range = windowFor(source, data.since);
  const finishedAt = new Date();
  try {
    const rows = await fetchRowsForSource(source, range);
    const { inserted, revised, hasRevenue } = await upsertConversionFacts(source, rows);
    await setSourceHealth(source.id, {
      status: "healthy",
      health: { ok: true, lastCheckedAt: finishedAt.toISOString(), hasRevenue: hasRevenue || source.health.hasRevenue === true },
      lastError: null,
      lastSyncAt: finishedAt,
    });
    l.info("tracking synced", { rows: rows.length, inserted, revised, window: windowLabel(source.kind), from: range.since, to: range.until });
  } catch (err) {
    if (err instanceof ProviderError && (err.category === "permission" || err.category === "validation")) {
      await degrade(source, err);
      l.warn("tracking source needs attention", { err: err.message, category: err.category });
      return;
    }
    const msg = err instanceof ProviderError ? `${err.category}: ${err.message}` : String(err);
    await setSourceHealth(source.id, { lastError: msg, health: { ...source.health, ok: false, message: msg, lastCheckedAt: finishedAt.toISOString() } });
    throw err;
  }
}
