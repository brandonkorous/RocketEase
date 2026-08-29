import type { SeriesPoint } from "@/lib/analytics/queries";
import { seriesBreakMarkers, splitAtBreaks, type BreakMarker } from "@/lib/analytics/breaks";
import type { DisplayMetric } from "@/lib/analytics/metrics";

/** Brand colors are allowed only for network marks; charts use them to identify networks. */
export const NETWORK_COLOR: Record<string, string> = { instagram: "#e1306c", facebook: "#1877f2", linkedin: "#0a66c2", tiktok: "#111111", x: "#111111", youtube: "#ff0000", pinterest: "#bd081c", mock: "#1d4ed8" };
const color = (n: string) => NETWORK_COLOR[n] ?? "#525252";
const short = (v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(v >= 10_000 ? 0 : 1)}K` : String(Math.round(v)));
const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function groupByNetwork(points: SeriesPoint[]) {
  const days = [...new Set(points.map((p) => p.day))].sort();
  const networks = [...new Set(points.map((p) => p.network))];
  const byNet = new Map(networks.map((n) => [n, new Map(points.filter((p) => p.network === n).map((p) => [p.day, p.value]))]));
  return { days, networks, byNet };
}

export function Legend({ networks, labels }: { networks: string[]; labels?: Record<string, string> }) {
  return (
    <ul className="flex flex-wrap items-center gap-3 text-xs text-secondary">
      {networks.map((n) => (<li key={n} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: color(n) }} />{labels?.[n] ?? n}</li>))}
    </ul>
  );
}

/** Day runs that sit wholly on one side of every definition break, with their global offsets. */
function segmentsOf(days: string[], markers: BreakMarker[]) {
  let start = 0;
  return splitAtBreaks(days, markers).map((run) => { const s = start; start += run.length; return { start: s, run }; });
}

/**
 * Vertical rule where a provider changed what the metric counts. The series is
 * split either side of it — old and new definitions are never one line.
 */
function BreakMarkers({ markers, xOf, height }: { markers: BreakMarker[]; xOf: (i: number) => number; height: number }) {
  return (
    <>
      {markers.map((m) => {
        const x = (xOf(m.index - 1) + xOf(m.index)) / 2;
        return (
          <g key={`${m.metric}-${m.day}`}>
            <title>{m.tooltip}</title>
            <line x1={x} x2={x} y1={6} y2={height - 20} className="stroke-base-content/40" strokeWidth="1" strokeDasharray="3 3" />
            <text x={x + 3} y={14} className="fill-secondary" fontSize="9">{m.label}</text>
          </g>
        );
      })}
    </>
  );
}

/** Multi-line trend, one line per network. Pure SVG, responsive via viewBox. */
export function LineChart({ points, metric = "engagement", height = 180 }: { points: SeriesPoint[]; metric?: DisplayMetric; height?: number }) {
  const { days, networks, byNet } = groupByNetwork(points);
  const W = 640;
  const H = height;
  const padL = 36;
  const padB = 22;
  const max = Math.max(1, ...points.map((p) => p.value));
  const x = (i: number) => padL + (days.length > 1 ? (i / (days.length - 1)) * (W - padL - 8) : 0);
  const y = (v: number) => 8 + (1 - v / max) * (H - padB - 8);
  if (days.length === 0) return <p className="py-10 text-center text-sm text-secondary/70">No data in this period.</p>;
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const labelEvery = Math.max(1, Math.ceil(days.length / 7));
  const markers = seriesBreakMarkers(metric, days);
  const segments = segmentsOf(days, markers);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={markers.length ? "Trend by network, split at a metric definition change" : "Trend by network"}>
      {ticks.map((t) => (<g key={t}><line x1={padL} x2={W - 8} y1={y(max * t)} y2={y(max * t)} className="stroke-base-300" strokeWidth="1" /><text x={padL - 6} y={y(max * t) + 3} textAnchor="end" className="fill-secondary" fontSize="9">{short(max * t)}</text></g>))}
      {days.map((d, i) => (i % labelEvery === 0 ? <text key={d} x={x(i)} y={H - 6} textAnchor="middle" className="fill-secondary" fontSize="9">{dayLabel(d)}</text> : null))}
      <BreakMarkers markers={markers} xOf={x} height={H} />
      {networks.map((n) => {
        const m = byNet.get(n)!;
        return (
          <g key={n}>
            {segments.map((seg) => (
              <path key={seg.start} d={seg.run.map((day, j) => `${j === 0 ? "M" : "L"}${x(seg.start + j).toFixed(1)},${y(m.get(day) ?? 0).toFixed(1)}`).join(" ")} fill="none" stroke={color(n)} strokeWidth="2" strokeLinejoin="round" />
            ))}
            {days.map((day, i) => (<circle key={day} cx={x(i)} cy={y(m.get(day) ?? 0)} r="2.5" fill={color(n)} />))}
          </g>
        );
      })}
    </svg>
  );
}

/** Stacked bars per day (followers by network). */
export function StackedBars({ points, height = 160 }: { points: SeriesPoint[]; height?: number }) {
  const { days, networks, byNet } = groupByNetwork(points);
  const W = 400;
  const H = height;
  const padL = 36;
  const padB = 20;
  const totals = days.map((d) => networks.reduce((s, n) => s + (byNet.get(n)!.get(d) ?? 0), 0));
  const max = Math.max(1, ...totals);
  if (days.length === 0) return <p className="py-10 text-center text-sm text-secondary/70">No data in this period.</p>;
  const bw = Math.max(4, ((W - padL - 8) / days.length) * 0.55);
  const x = (i: number) => padL + ((i + 0.5) / days.length) * (W - padL - 8) - bw / 2;
  const labelEvery = Math.max(1, Math.ceil(days.length / 7));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Followers by network per day">
      {[0, 0.5, 1].map((t) => (<g key={t}><line x1={padL} x2={W - 8} y1={8 + (1 - t) * (H - padB - 8)} y2={8 + (1 - t) * (H - padB - 8)} className="stroke-base-300" strokeWidth="1" /><text x={padL - 6} y={8 + (1 - t) * (H - padB - 8) + 3} textAnchor="end" className="fill-secondary" fontSize="9">{short(max * t)}</text></g>))}
      {days.map((d, i) => {
        let acc = 0;
        return (
          <g key={d}>
            {networks.map((n) => { const v = byNet.get(n)!.get(d) ?? 0; const h = (v / max) * (H - padB - 8); const yTop = 8 + (1 - (acc + v) / max) * (H - padB - 8); acc += v; return <rect key={n} x={x(i)} y={yTop} width={bw} height={h} fill={color(n)} />; })}
            {i % labelEvery === 0 && <text x={x(i) + bw / 2} y={H - 6} textAnchor="middle" className="fill-secondary" fontSize="9">{dayLabel(d)}</text>}
          </g>
        );
      })}
    </svg>
  );
}

/** Donut with a total in the middle. */
export function Donut({ slices, total }: { slices: { network: string; value: number }[]; total: number }) {
  const R = 44;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <svg viewBox="0 0 120 120" className="h-40 w-40 shrink-0" role="img" aria-label="Share by network">
      {slices.map((s, i) => { const frac = total ? s.value / total : 0; const dash = `${(frac * C).toFixed(2)} ${(C - frac * C).toFixed(2)}`; const el = <circle key={i} cx="60" cy="60" r={R} fill="none" stroke={color(s.network)} strokeWidth="18" strokeDasharray={dash} strokeDashoffset={-offset * C} transform="rotate(-90 60 60)" />; offset += frac; return el; })}
      {total === 0 && <circle cx="60" cy="60" r={R} fill="none" className="stroke-base-300" strokeWidth="18" />}
      <text x="60" y="58" textAnchor="middle" fontSize="15" fontWeight="700" className="fill-base-content">{short(total)}</text>
      <text x="60" y="72" textAnchor="middle" fontSize="8" className="fill-secondary">Total</text>
    </svg>
  );
}
