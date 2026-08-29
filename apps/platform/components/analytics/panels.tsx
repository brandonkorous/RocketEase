"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { METRICS, formatMetric } from "@/lib/analytics/metrics";
import { engagementOf } from "@/lib/analytics/derive";
import { trackingUnavailable } from "@/lib/tracking/availability";
import { filtersToQuery } from "@/lib/analytics/periods";
import type { AnalyticsData } from "@/lib/analytics/screen";
import { workspacePath } from "@/lib/nav";
import { NetMark } from "../net-mark";
import { Donut, Legend, LineChart, StackedBars } from "./charts";
import { MetricInfo } from "./scorecard";

export function Panel({ title, info, action, children }: { title: string; info?: keyof typeof METRICS; action?: { label: string; href: string }; children: React.ReactNode }) {
  return (
    <section className="flex flex-col rounded-box border border-base-300 p-4" aria-label={title}>
      <div className="flex items-center justify-between gap-2"><h2 className="flex items-center text-sm font-semibold">{title}{info && <MetricInfo m={METRICS[info]} freshness={null} />}</h2></div>
      <div className="mt-3 flex-1">{children}</div>
      {action && <Link href={action.href} className="mt-3 text-xs font-medium hover:underline">{action.label} →</Link>}
    </section>
  );
}

const ROWS = ["reach", "impressions", "engagement", "link_clicks"] as const;

export function OrganicVsPaid({ data }: { data: AnalyticsData }) {
  const hasPaid = data.paid.spend != null;
  const noSource = trackingUnavailable("conversions", data.conversions, {});
  const paidNote = hasPaid ? undefined : "No paid facts in this period. Connect an ad account from a campaign's Ads tab.";
  const value = (k: (typeof ROWS)[number], t: AnalyticsData["organic"], has: boolean) => (k === "engagement" ? engagementOf(t) : t[k]) ?? (has ? 0 : null);
  const cell = (v: number | null, m: keyof typeof METRICS) => (v === null ? <span className="text-secondary/70" title={paidNote}>—</span> : formatMetric(METRICS[m], v));
  return (
    <Panel title="Organic vs Paid performance" info="engagement">
      <table className="w-full text-sm">
        <thead className="text-xs text-secondary"><tr><th className="pb-2 text-left font-medium">Metric</th><th className="pb-2 text-right font-medium">Organic</th><th className="pb-2 text-right font-medium">Paid</th></tr></thead>
        <tbody className="divide-y divide-base-300">
          {ROWS.map((k) => (<tr key={k}><td className="py-2">{METRICS[k].name}</td><td className="py-2 text-right font-semibold">{cell(value(k, data.organic, data.hasData), k)}</td><td className="py-2 text-right font-semibold">{cell(value(k, data.paid, hasPaid), k)}</td></tr>))}
          <tr><td className="py-2">Conversions</td><td className="py-2 text-right font-semibold">{noSource ? <span className="text-secondary/70" title={noSource}>—</span> : cell(data.organic.conversions ?? 0, "conversions")}</td><td className="py-2 text-right font-semibold">{cell(data.paid.conversions ?? (hasPaid ? 0 : null), "conversions")}</td></tr>
          <tr><td className="py-2">Spend</td><td className="py-2 text-right text-secondary/70">n/a</td><td className="py-2 text-right font-semibold">{cell(data.paid.spend ?? null, "spend")}</td></tr>
        </tbody>
      </table>
      <p className="mt-2 text-xs text-secondary/70">{hasPaid ? `Paid figures are in ${data.paidAttribution?.currency ?? "the ad account currency"}; no currency conversion is applied.` : "Paid columns fill in once an ad account is connected and imported."}</p>
    </Panel>
  );
}

/** Attribution is deterministic (campaign tagging + provider-reported paid results); the model/window/freshness always show (analytics.md). */
export function AttributionPanel({ data }: { data: AnalyticsData }) {
  const a = data.paidAttribution;
  const c = data.conversionProvenance;
  return (
    <section className="rounded-box border border-base-300 p-4" aria-label="Attribution summary">
      <h2 className="text-sm font-semibold">Attribution summary</h2>
      {a && (
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-secondary">Model</dt><dd>Deterministic campaign tagging · {a.model}</dd>
          <dt className="text-secondary">Window</dt><dd>{a.window}</dd>
          <dt className="text-secondary">Source</dt><dd>{a.sources.join(", ")}</dd>
          <dt className="text-secondary">Currency</dt><dd>{a.currency} (no conversion applied)</dd>
          <dt className="text-secondary">Freshness</dt><dd>{a.freshLabel ?? "never synced"}</dd>
          <dt className="text-secondary">Paid conversions</dt><dd className="font-semibold">{formatMetric(METRICS.conversions, data.paid.conversions ?? 0)}</dd>
        </dl>
      )}
      {c && <SourceAttribution data={data} />}
      {!a && !c && (
        <p className="mt-3 text-sm text-secondary">Conversions per campaign appear once an ad account is connected (Campaigns → Ads) or a conversion tracking source is connected in Settings → Tracking. Attribution always shows its model, window, and freshness.</p>
      )}
    </section>
  );
}

/** Site-reported half of attribution: what the tracking sources say and when they last said it. */
function SourceAttribution({ data }: { data: AnalyticsData }) {
  const c = data.conversionProvenance!;
  const revenue = data.paid.revenue ?? data.organic.revenue ?? null;
  return (
    <div className={data.paidAttribution ? "mt-4 border-t border-base-300 pt-3" : "mt-3"}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-secondary">Site-reported conversions</h3>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-secondary">Model</dt><dd>{c.model}</dd>
        <dt className="text-secondary">Window</dt><dd>{c.window}</dd>
        <dt className="text-secondary">Source</dt><dd>{c.sources.join(", ")}</dd>
        <dt className="text-secondary">Currency</dt><dd>{c.currency} (no conversion applied)</dd>
        <dt className="text-secondary">Freshness</dt><dd>{data.conversionsRefreshedLabel ?? "never synced"}</dd>
        <dt className="text-secondary">Revenue</dt><dd className="font-semibold">{revenue === null ? <span className="text-secondary/70">unavailable</span> : formatMetric(METRICS.revenue, revenue)}</dd>
      </dl>
      <p className="mt-2 text-xs text-secondary/70">Paid clicks are counted once by the ad platform and never again here, so the two halves can be added.</p>
    </div>
  );
}

const TREND_OPTIONS: AnalyticsData["trendMetric"][] = ["engagement", "reach", "impressions"];

export function TrendPanel({ data }: { data: AnalyticsData }) {
  const router = useRouter();
  const networks = [...new Set(data.trend.map((p) => p.network))];
  const base = `${workspacePath(data.workspaceId, "analytics")}?${filtersToQuery(data.filters)}`;
  return (
    <section className="flex flex-col rounded-box border border-base-300 p-4" aria-label="Cross-channel trend">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center text-sm font-semibold">Cross-channel trend<MetricInfo m={METRICS[data.trendMetric]} freshness={null} /></h2>
        <select className="select select-xs w-auto" value={data.trendMetric} onChange={(e) => router.push(`${base}&trend=${e.target.value}`)} aria-label="Trend metric">
          {TREND_OPTIONS.map((k) => (<option key={k} value={k}>{METRICS[k].name}</option>))}
        </select>
      </div>
      <div className="mt-3"><Legend networks={networks} /></div>
      <div className="mt-2"><LineChart points={data.trend} metric={data.trendMetric} /></div>
      {data.definitionChanges.length > 0 && (
        <div className="mt-2 rounded-field border border-base-300 p-2">
          <p className="text-xs font-medium">Definition changes in this range</p>
          <ul className="mt-1 flex flex-col gap-1 text-xs text-secondary/80">
            {data.definitionChanges.map((c, i) => (<li key={i}>{c}</li>))}
          </ul>
          <p className="mt-1 text-xs text-secondary/70">The line is cut at the change: values either side are different measurements and are never joined.</p>
        </div>
      )}
    </section>
  );
}

export function FunnelPanel({ data }: { data: AnalyticsData }) {
  const why = (k: "sessions" | "conversions") => trackingUnavailable(k, data.conversions, data.paid);
  const steps: { k: keyof typeof METRICS; v: number | null; why?: string | null }[] = [
    { k: "reach", v: data.organic.reach ?? null },
    { k: "engagement", v: data.organic.engagement ?? null },
    { k: "link_clicks", v: data.organic.link_clicks ?? null },
    { k: "sessions", v: why("sessions") ? null : (data.organic.sessions ?? null), why: why("sessions") },
    { k: "conversions", v: why("conversions") ? null : (data.organic.conversions ?? null), why: why("conversions") },
  ];
  const top = steps[0].v ?? 0;
  return (
    <Panel title="Conversion funnel" info="ctr">
      <ol className="flex flex-col gap-2">
        {steps.map((s, i) => {
          const prev = i > 0 ? steps[i - 1].v : null;
          const rate = s.v !== null && prev ? `${((s.v / prev) * 100).toFixed(1)}%` : null;
          const width = s.v !== null && top ? Math.max(12, (s.v / top) * 100) : 12;
          return (
            <li key={s.k} className="flex items-center gap-3 text-sm">
              <span className="h-8 rounded-field bg-base-300" style={{ width: `${width}%` }} aria-hidden="true" />
              <span className="flex-1 text-secondary">{METRICS[s.k].name}</span>
              {rate && <span className="text-xs text-secondary/70">{rate}</span>}
              <span className="font-semibold">{s.v === null ? <span className="text-secondary/50" title={s.why ?? METRICS[s.k].unavailable}>—</span> : formatMetric(METRICS[s.k], s.v)}</span>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-xs text-secondary/70">{funnelNote(data)}</p>
    </Panel>
  );
}

/** Says which source the last two steps came from, or exactly what is missing. */
function funnelNote(data: AnalyticsData) {
  const why = trackingUnavailable("conversions", data.conversions, data.paid);
  if (why) return why;
  const names = data.conversions.sources.filter((s) => s.status === "healthy").map((s) => s.name).join(", ");
  return `Sessions and conversions from ${names || "your ad accounts"}${data.conversionsRefreshedLabel ? `, last synced ${data.conversionsRefreshedLabel}` : ""}. Reach through link clicks are organic figures from the networks.`;
}

export function AudiencePanel({ data }: { data: AnalyticsData }) {
  const networks = [...new Set(data.followers.map((p) => p.network))];
  const total = data.followersTotal;
  const prev = data.followersPrev;
  const pct = total !== null && prev ? ((total - prev) / prev) * 100 : null;
  return (
    <Panel title="Audience growth" info="followers">
      <div className="text-xs text-secondary">Total followers</div>
      <div className="flex items-baseline gap-2"><span className="text-2xl font-bold tracking-tight">{total === null ? "—" : total.toLocaleString()}</span>{pct !== null && <span className={`text-xs ${pct >= 0 ? "text-success" : "text-error"}`}>{pct >= 0 ? "↑" : "↓"} {Math.abs(pct).toFixed(1)}%{data.compareLabel ? ` vs ${data.compareLabel}` : ""}</span>}</div>
      <div className="mt-2"><Legend networks={networks} /></div>
      <div className="mt-2"><StackedBars points={data.followers} /></div>
    </Panel>
  );
}

export function ChannelMixPanel({ data }: { data: AnalyticsData }) {
  const total = data.mix.reduce((s, m) => s + m.value, 0);
  return (
    <Panel title="Channel mix (by engagement)" info="engagement">
      <div className="flex flex-wrap items-center gap-4">
        <Donut slices={data.mix} total={total} />
        <ul className="flex flex-col gap-1.5 text-sm">
          {data.mix.map((m) => (<li key={m.channelId} className="flex items-center gap-2"><NetMark network={m.network} size={14} /><span className="min-w-0 flex-1 truncate">{m.name}</span><span className="font-semibold">{formatMetric(METRICS.engagement, m.value)}</span><span className="text-xs text-secondary/70">({total ? ((m.value / total) * 100).toFixed(1) : "0.0"}%)</span></li>))}
          {data.mix.length === 0 && <li className="text-xs text-secondary/70">No engagement recorded yet.</li>}
        </ul>
      </div>
    </Panel>
  );
}

export function TopPostsPanel({ data }: { data: AnalyticsData }) {
  const router = useRouter();
  const base = `${workspacePath(data.workspaceId, "analytics")}?${filtersToQuery(data.filters)}`;
  return (
    <section className="rounded-box border border-base-300 p-4" aria-label="Top posts">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Top posts</h2>
        <select className="select select-xs w-auto" value={data.topBy} onChange={(e) => router.push(`${base}&top=${e.target.value}`)} aria-label="Rank top posts by"><option value="engagement">By engagement</option><option value="reach">By reach</option><option value="link_clicks">By link clicks</option></select>
      </div>
      <table className="mt-3 w-full text-sm">
        <thead className="text-xs text-secondary"><tr><th className="pb-1 text-left font-medium">Post</th><th className="pb-1 text-right font-medium">Reach</th><th className="pb-1 text-right font-medium">Engagement</th></tr></thead>
        <tbody className="divide-y divide-base-300">
          {data.top.map((p, i) => (<tr key={i}><td className="py-2"><Link href={workspacePath(data.workspaceId, `posts/${p.itemId}`)} className="flex items-center gap-2 hover:underline"><NetMark network={p.network} size={14} /><span className="min-w-0"><span className="block truncate font-medium">{p.title}</span><span className="block text-xs text-secondary/70">{p.publishedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · {p.channelName}</span></span></Link></td><td className="py-2 text-right">{formatMetric(METRICS.reach, p.reach)}</td><td className="py-2 text-right font-semibold">{formatMetric(METRICS.engagement, p.engagement)}</td></tr>))}
          {data.top.length === 0 && <tr><td colSpan={3} className="py-4 text-center text-xs text-secondary/70">No published posts with insights in this period.</td></tr>}
        </tbody>
      </table>
      <Link href={workspacePath(data.workspaceId, "content")} className="mt-3 block text-xs font-medium hover:underline">View all posts →</Link>
    </section>
  );
}
