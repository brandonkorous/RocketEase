import { authenticateApi, requireScope } from "@/lib/api/auth";
import { apiHandler, apiJson, invalid } from "@/lib/api/errors";
import { metricValues } from "@/lib/analytics/metric-values";
import { METRICS, SCORECARD, type DisplayMetric } from "@/lib/analytics/metrics";
import { parseAnalyticsFilters } from "@/lib/analytics/periods";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEYS = Object.keys(METRICS) as DisplayMetric[];

/**
 * GET /api/v1/metrics?metric=reach,engagement&from=&to=
 *
 * Every value carries its definition version, formula, caveats and — when it
 * cannot be shown — the reason. An unavailable metric is never reported as 0.
 */
export async function GET(req: Request) {
  return apiHandler(async () => {
    const ctx = await authenticateApi(req);
    requireScope(ctx, "analytics.view_scoped");
    const url = new URL(req.url);
    const requested = (url.searchParams.get("metric") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const unknown = requested.filter((m) => !(KEYS as string[]).includes(m));
    if (unknown.length) throw invalid(`Unknown metric: ${unknown.join(", ")}. Valid keys: ${KEYS.join(", ")}.`);
    const keys = requested.length ? (requested as DisplayMetric[]) : SCORECARD;

    const sp: Record<string, string> = Object.fromEntries(url.searchParams.entries());
    if (sp.from && sp.to) sp.range = "custom";
    if (sp.channelId) sp.channel = sp.channelId;
    if (sp.campaignId) sp.campaign = sp.campaignId;
    const filters = parseAnalyticsFilters(sp, ctx.timezone);
    const body = await metricValues(ctx.workspaceId, keys, filters, { from: filters.from, to: filters.to });
    return apiJson({ timezone: ctx.timezone, scope: filters.scope, ...body });
  });
}
