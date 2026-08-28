import { NetMark } from "@/components/library-screen";
import type { PostPerformance } from "@/lib/analytics/post-performance";
import { formatInZone } from "@/lib/time";

const num = (v: number) => Math.round(v).toLocaleString();

/**
 * Post-level facts per destination, with the freshness stamp and the metric
 * definitions version (analytics.md "Metric contract"). A channel that has no
 * facts yet says so rather than showing a zero.
 */
export function Performance({ perf, tz }: { perf: PostPerformance; tz: string }) {
  const any = perf.rows.some((r) => r.hasFacts);
  return (
    <section className="rounded-box border border-base-300 p-5" aria-labelledby="perf-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="perf-h" className="text-base font-semibold">Performance</h2>
        <span className="text-xs text-secondary/70">{perf.freshAt ? `Facts as of ${formatInZone(perf.freshAt, tz)}` : "No insights ingested yet"} · definitions {perf.definitionsVersion}</span>
      </div>
      {!any ? (
        <p className="mt-3 text-sm text-secondary">Insights arrive after the first sync following publication. Providers publish daily figures and revise recent days, so numbers can still move.</p>
      ) : (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="Reach" value={num(perf.totals.reach)} />
            <Stat label="Impressions" value={num(perf.totals.impressions)} />
            <Stat label="Engagement" value={num(perf.totals.engagement)} />
            <Stat label="Link clicks" value={num(perf.totals.clicks)} />
            <Stat label="Engagement rate" value={perf.totals.rate === null ? "—" : `${(perf.totals.rate * 100).toFixed(1)}%`} />
          </dl>
          <ul className="mt-4 divide-y divide-base-300">
            {perf.rows.map((r) => (
              <li key={`${r.channelId}-${r.remoteId}`} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <NetMark network={r.network} size={16} />
                <span className="min-w-0 flex-1 truncate">{r.channelName}</span>
                {r.hasFacts ? (
                  <span className="text-xs text-secondary tabular-nums">{num(r.reach)} reach · {num(r.engagement)} engagement · {num(r.clicks)} clicks</span>
                ) : (
                  <span className="text-xs text-secondary/70">No facts yet</span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-secondary/70">Reach is unique within a network and a day only; totals across networks are additive, not deduplicated. Engagement rate is engagement ÷ reach.</p>
        </>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-field border border-base-300 px-3 py-2">
      <dt className="text-xs text-secondary/70">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
