/*
 * Pinterest insights → canonical daily facts.
 *   GET /v5/user_account/analytics   → daily ACCOUNT series (impressions, saves,
 *                                      outbound clicks, engagement, follows)
 *   GET /v5/pins/{pin_id}/analytics  → daily PIN series
 *   GET /v5/user_account             → follower_count snapshot
 *
 * Pinterest reports analytics for the whole account, never per board, which is
 * why account series hang off the `pinterest_account` channel and board
 * channels carry pin-level facts only (see client.ts `capsFor`). Both require
 * the connected account to be a Pinterest business account.
 *
 * PIN_CLICK (a click that opens the pin closeup) is requested by neither call:
 * it is a component of Pinterest's own ENGAGEMENT total and has no separate
 * entry in the platform's canonical metric registry.
 */
import type { CanonicalMetric, InsightFact, InsightsPage, InsightsRequest } from "../insights-types";
import type { ChannelDescriptor, Credential } from "../types";
import { pin } from "./client";

/** Pinterest omits a metric key entirely when it has no value for that day. */
type Bucket = { date?: string; metrics?: Record<string, number | string | undefined> };
type Analytics = Record<string, { summary_metrics?: Record<string, number>; daily_metrics?: Bucket[] } | undefined>;

/** Pinterest metric type → canonical metric. */
export const METRIC_MAP: Record<string, CanonicalMetric> = {
  IMPRESSION: "impressions",
  SAVE: "saves",
  OUTBOUND_CLICK: "link_clicks",
  ENGAGEMENT: "engagement",
  FOLLOW: "follower_gain",
};

const ACCOUNT_TYPES = ["IMPRESSION", "SAVE", "PIN_CLICK", "OUTBOUND_CLICK", "ENGAGEMENT", "FOLLOW"];
const PIN_TYPES = ["IMPRESSION", "SAVE", "PIN_CLICK", "OUTBOUND_CLICK"];

/**
 * The response is keyed by the split/app-type value ("all", "ALL", …), so take
 * whichever branch actually carries daily_metrics rather than guessing casing.
 */
export function analyticsToFacts(body: Analytics, entity: InsightFact["entity"], remoteId: string | undefined): InsightFact[] {
  const branch = Object.values(body ?? {}).find((v) => v && Array.isArray(v.daily_metrics));
  const out: InsightFact[] = [];
  for (const b of branch?.daily_metrics ?? []) {
    if (!b.date) continue;
    for (const [key, metric] of Object.entries(METRIC_MAP)) {
      const raw = b.metrics?.[key];
      if (raw === undefined || raw === null || raw === "") continue;
      const value = Number(raw);
      // Pinterest returns -1 for days where a metric is not yet available.
      if (!Number.isFinite(value) || value < 0) continue;
      out.push({ entity, remoteId, metric, day: b.date, value, source: `pinterest.${key}` });
    }
  }
  return out;
}

const window = (req: InsightsRequest) => ({ start_date: req.since, end_date: req.until });

async function accountSeries(token: string, req: InsightsRequest): Promise<InsightFact[]> {
  const res = await pin<Analytics>("/user_account/analytics", token, {
    query: { ...window(req), metric_types: ACCOUNT_TYPES.join(","), from_claimed_content: "BOTH", pin_format: "ALL", app_types: "ALL", split_field: "NO_SPLIT" },
  });
  return analyticsToFacts(res.body, "channel", undefined);
}

async function followerSnapshot(token: string, day: string): Promise<InsightFact[]> {
  const res = await pin<{ follower_count?: number }>("/user_account", token).catch(() => ({ body: {} as { follower_count?: number } }));
  const n = res.body.follower_count;
  return typeof n === "number" ? [{ entity: "channel", metric: "followers", day, value: n, source: "pinterest.user_account.follower_count" }] : [];
}

/** Pin analytics are one request per pin; a deleted or too-new pin is skipped. */
async function pinSeries(token: string, ids: string[], req: InsightsRequest): Promise<InsightFact[]> {
  const out: InsightFact[] = [];
  for (const id of ids) {
    const res = await pin<Analytics>(`/pins/${encodeURIComponent(id)}/analytics`, token, { query: { ...window(req), metric_types: PIN_TYPES.join(","), app_types: "ALL" } }).catch(() => ({ body: {} as Analytics }));
    out.push(...analyticsToFacts(res.body, "post", id));
  }
  return out;
}

export async function fetchInsights(cred: Credential, ch: ChannelDescriptor, req: InsightsRequest): Promise<InsightsPage> {
  const t = cred.accessToken;
  const pins = await pinSeries(t, req.postRemoteIds ?? [], req);
  if (!ch.capabilities.insights.audience) return { facts: pins, timezone: "UTC" };
  const [series, followers] = await Promise.all([accountSeries(t, req), followerSnapshot(t, req.until)]);
  return { facts: [...series, ...followers, ...pins], timezone: "UTC" };
}
