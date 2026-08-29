/*
 * Data-quality checks (analytics.md "Data quality", 5.7). Each check returns
 * findings for one workspace; quality-store.ts persists them. Pure SQL over
 * metric_fact + sync_cursor so the worker can run it nightly for every tenant.
 */
import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { QualityKind } from "@/db/schema/quality";
import { METRICS } from "./metrics";
import { allBreaks, PROVIDER_NETWORKS } from "./breaks";

export type Finding = { kind: QualityKind; subject: string; severity: "info" | "warning" | "error"; message: string; details?: Record<string, unknown> };

const rows = async <T>(q: ReturnType<typeof sql>) => (await db.execute(q)) as unknown as T[];
const maxFreshnessHours = () => Math.max(...Object.values(METRICS).map((m) => m.freshnessHours));
const metricName = (m: string) => METRICS[m as keyof typeof METRICS]?.name ?? m;
/** Post-level sums may legitimately trail channel totals; only a clear overshoot is a finding. */
export const RECONCILE_TOLERANCE = 0.05;
export const RECONCILED_METRICS = ["reactions", "comments", "shares", "saves", "link_clicks"];

/** Insight-capable channels whose last successful ingest is older than the metric contract allows. */
export async function checkFreshness(workspaceId: string): Promise<Finding[]> {
  const hours = maxFreshnessHours();
  const list = await rows<{ id: string; name: string; last: string | null; err: string | null }>(sql`
    select c.id, c.name, s.last_success_at as last, s.last_error as err
    from channel c left join sync_cursor s on s.channel_id = c.id and s.resource = 'insights'
    where c.workspace_id = ${workspaceId} and c.status in ('healthy','degraded')
      and (c.capabilities->'insights'->>'organic')::boolean
      and (s.last_success_at is null or s.last_success_at < now() - make_interval(hours => ${hours}::int))`);
  return list.map((c) => ({
    kind: "freshness",
    subject: c.id,
    severity: "warning",
    message: c.last ? `${c.name}: insights older than ${hours}h` : `${c.name}: no insights ingested yet`,
    details: { lastSuccessAt: c.last, lastError: c.err, freshnessHours: hours },
  }));
}

/** The same remote post reported under more than one channel of the workspace (double-connected page). */
export async function checkDuplicates(workspaceId: string): Promise<Finding[]> {
  const list = await rows<{ metric: string; n: number }>(sql`
    select metric, count(*)::int as n from (
      select metric, remote_id, day from metric_fact
      where workspace_id = ${workspaceId} and entity = 'post'
      group by metric, remote_id, day having count(distinct channel_id) > 1) d group by metric`);
  return list.map((r) => ({ kind: "duplicate", subject: r.metric, severity: "warning", message: `${metricName(r.metric)}: ${r.n} post-day(s) counted under more than one channel`, details: { count: r.n } }));
}

/** Negative values, and daily values far outside the channel's own 30-day distribution. */
export async function checkImplausible(workspaceId: string): Promise<Finding[]> {
  const neg = await rows<{ channel_id: string; metric: string; n: number }>(sql`
    select channel_id, metric, count(*)::int as n from metric_fact
    where workspace_id = ${workspaceId} and value < 0 group by channel_id, metric`);
  const spikes = await rows<{ channel_id: string; metric: string; day: string; value: number; med: number }>(sql`
    with f as (select channel_id, metric, day, value::float as value from metric_fact
               where workspace_id = ${workspaceId} and entity = 'channel' and metric <> 'followers' and day >= to_char(now() - interval '30 days', 'YYYY-MM-DD')),
         m as (select channel_id, metric, percentile_cont(0.5) within group (order by value) as med from f group by channel_id, metric)
    select f.channel_id, f.metric, f.day, f.value, m.med from f join m using (channel_id, metric) where m.med > 0 and f.value > m.med * 1000`);
  const negatives = neg.map<Finding>((r) => ({ kind: "implausible", subject: `${r.channel_id}:${r.metric}`, severity: "error", message: `${r.n} negative ${metricName(r.metric)} value(s)`, details: { channelId: r.channel_id, metric: r.metric, count: r.n } }));
  const outliers = spikes.map<Finding>((r) => ({ kind: "implausible", subject: `${r.channel_id}:${r.metric}:${r.day}`, severity: "warning", message: `${metricName(r.metric)} on ${r.day} is over 1000x the 30-day median`, details: { channelId: r.channel_id, metric: r.metric, day: r.day, value: r.value, median: r.med } }));
  return [...negatives, ...outliers];
}

/** Facts whose value changed on re-ingest within the last 24h (provider revisions/backfills). */
export async function checkRevisions(workspaceId: string): Promise<Finding[]> {
  const list = await rows<{ channel_id: string; n: number; from: string; to: string }>(sql`
    select channel_id, count(*)::int as n, min(day) as "from", max(day) as "to" from metric_fact
    where workspace_id = ${workspaceId} and revision > 1 and fresh_at > now() - interval '24 hours' group by channel_id`);
  return list.map((r) => ({ kind: "revised", subject: r.channel_id, severity: "info", message: `${r.n} fact(s) revised by the provider (${r.from} to ${r.to})`, details: { channelId: r.channel_id, count: r.n, from: r.from, to: r.to } }));
}

/** Post-level sums must not exceed the channel-level total for the same metric and day beyond tolerance. */
export async function checkReconciliation(workspaceId: string): Promise<Finding[]> {
  const list = await rows<{ channel_id: string; metric: string; days: number; worst: number }>(sql`
    with c as (select channel_id, metric, day, value::float as total from metric_fact
               where workspace_id = ${workspaceId} and entity = 'channel' and metric in (${sql.join(RECONCILED_METRICS.map((m) => sql`${m}`), sql`, `)})),
         p as (select channel_id, metric, day, sum(value)::float as posts from metric_fact
               where workspace_id = ${workspaceId} and entity = 'post' group by channel_id, metric, day)
    select c.channel_id, c.metric, count(*)::int as days, max(p.posts - c.total) as worst
    from c join p using (channel_id, metric, day)
    where p.posts > c.total * (1 + ${RECONCILE_TOLERANCE}::float) + 1 group by c.channel_id, c.metric`);
  return list.map((r) => ({ kind: "reconciliation", subject: `${r.channel_id}:${r.metric}`, severity: "warning", message: `${metricName(r.metric)}: post totals exceed the channel total on ${r.days} day(s)`, details: { channelId: r.channel_id, metric: r.metric, days: r.days, worstGap: r.worst, tolerance: RECONCILE_TOLERANCE } }));
}

/**
 * A stored series that spans one of the registry's definition breaks. Info only:
 * nothing is wrong with the data, but the two halves measure different things.
 */
export async function checkDefinitionBreaks(workspaceId: string): Promise<Finding[]> {
  const out: Finding[] = [];
  for (const p of allBreaks()) {
    const networks = PROVIDER_NETWORKS[p.entry.provider] ?? [];
    if (!networks.length) continue;
    const [r] = await rows<{ before_n: number; after_n: number }>(sql`
      select count(*) filter (where f.day < ${p.entry.effectiveFrom})::int as before_n,
             count(*) filter (where f.day >= ${p.entry.effectiveFrom})::int as after_n
      from metric_fact f join channel c on c.id = f.channel_id
      where f.workspace_id = ${workspaceId} and f.metric = ${p.metric}
        and c.network in (${sql.join(networks.map((n) => sql`${n}`), sql`, `)})`);
    if (!r || !Number(r.before_n) || !Number(r.after_n)) continue;
    out.push({
      kind: "definition_break",
      subject: `${p.metric}:${p.entry.provider}:${p.entry.effectiveFrom}`,
      severity: "info",
      message: `${p.metricName}: this workspace has facts either side of the ${p.label.replace("Definition changed — ", "")} definition change on ${p.entry.effectiveFrom}`,
      details: { metric: p.metric, provider: p.entry.provider, effectiveFrom: p.entry.effectiveFrom, before: Number(r.before_n), after: Number(r.after_n), note: p.entry.note },
    });
  }
  return out;
}

export async function collectFindings(workspaceId: string): Promise<Finding[]> {
  const parts = await Promise.all([checkFreshness(workspaceId), checkDuplicates(workspaceId), checkImplausible(workspaceId), checkRevisions(workspaceId), checkReconciliation(workspaceId), checkDefinitionBreaks(workspaceId)]);
  return parts.flat();
}
