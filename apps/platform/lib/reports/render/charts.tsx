/*
 * Print-safe charts: pure inline SVG with explicit fills, so the document has
 * no stylesheet dependency. Network brand colours are the one allowed colour
 * (design.md) and identify the series.
 */
import React from "react"; // see index.tsx: the worker uses the classic JSX runtime
import { NETWORK_COLOR } from "@/components/analytics/charts";
import type { SeriesPoint } from "@/lib/analytics/queries";
import { seriesBreakMarkers, splitAtBreaks, type BreakMarker } from "@/lib/analytics/breaks";
import type { DisplayMetric } from "@/lib/analytics/metrics";

const color = (n: string) => NETWORK_COLOR[n] ?? "#525252";
const short = (v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(v >= 10_000 ? 0 : 1)}K` : String(Math.round(v)));
const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

const AXIS = "#e5e5e5";
const LABEL = "#737373";

function grouped(points: SeriesPoint[]) {
  const days = [...new Set(points.map((p) => p.day))].sort();
  const networks = [...new Set(points.map((p) => p.network))];
  const byNet = new Map(networks.map((n) => [n, new Map(points.filter((p) => p.network === n).map((p) => [p.day, p.value]))]));
  return { days, networks, byNet };
}

export function Legend({ networks }: { networks: string[] }) {
  if (!networks.length) return null;
  return (
    <div className="legend">
      {networks.map((n) => (
        <span key={n}>
          <span className="dot" style={{ background: color(n) }} />
          {n}
        </span>
      ))}
    </div>
  );
}

/** Day runs that sit wholly on one side of every definition break, with their global offsets. */
function segmentsOf(days: string[], markers: BreakMarker[]) {
  let start = 0;
  return splitAtBreaks(days, markers).map((run) => { const s = start; start += run.length; return { start: s, run }; });
}

/** One line per network across the period, cut wherever a provider redefined the metric. */
export function TrendChart({ points, metric = "engagement" }: { points: SeriesPoint[]; metric?: DisplayMetric }) {
  const { days, networks, byNet } = grouped(points);
  if (days.length === 0) return <p className="muted small">No daily facts were stored for this period.</p>;
  const [W, H, padL, padB] = [880, 220, 42, 24];
  const max = Math.max(1, ...points.map((p) => p.value));
  const x = (i: number) => padL + (days.length > 1 ? (i / (days.length - 1)) * (W - padL - 10) : 0);
  const y = (v: number) => 10 + (1 - v / max) * (H - padB - 10);
  const every = Math.max(1, Math.ceil(days.length / 8));
  const markers = seriesBreakMarkers(metric, days);
  const segments = segmentsOf(days, markers);
  return (
    <div className="chartwrap">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Trend by network">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - 10} y1={y(max * t)} y2={y(max * t)} stroke={AXIS} strokeWidth="1" />
            <text x={padL - 6} y={y(max * t) + 3} textAnchor="end" fill={LABEL} fontSize="10">{short(max * t)}</text>
          </g>
        ))}
        {days.map((d, i) => (i % every === 0 ? <text key={d} x={x(i)} y={H - 6} textAnchor="middle" fill={LABEL} fontSize="10">{dayLabel(d)}</text> : null))}
        {markers.map((m) => {
          const mx = (x(m.index - 1) + x(m.index)) / 2;
          return (
            <g key={`${m.metric}-${m.day}`}>
              <title>{m.tooltip}</title>
              <line x1={mx} x2={mx} y1={8} y2={H - 20} stroke="#0a0a0a" strokeWidth="1" strokeDasharray="3 3" />
              <text x={mx + 4} y={16} fill={LABEL} fontSize="10">{m.label}</text>
            </g>
          );
        })}
        {networks.map((n) => (
          <g key={n}>
            {segments.map((seg) => (
              <path key={seg.start} d={seg.run.map((d, j) => `${j === 0 ? "M" : "L"}${x(seg.start + j).toFixed(1)},${y(byNet.get(n)!.get(d) ?? 0).toFixed(1)}`).join(" ")} fill="none" stroke={color(n)} strokeWidth="2" strokeLinejoin="round" />
            ))}
          </g>
        ))}
      </svg>
    </div>
  );
}

/** Share of the selected metric per channel. */
export function MixChart({ slices, total }: { slices: { network: string; value: number }[]; total: number }) {
  const R = 44;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <svg viewBox="0 0 120 120" width="150" height="150" role="img" aria-label="Share by network">
      {total === 0 && <circle cx="60" cy="60" r={R} fill="none" stroke={AXIS} strokeWidth="18" />}
      {slices.map((s, i) => {
        const frac = total ? s.value / total : 0;
        const el = <circle key={i} cx="60" cy="60" r={R} fill="none" stroke={color(s.network)} strokeWidth="18" strokeDasharray={`${(frac * C).toFixed(2)} ${(C - frac * C).toFixed(2)}`} strokeDashoffset={-offset * C} transform="rotate(-90 60 60)" />;
        offset += frac;
        return el;
      })}
      <text x="60" y="58" textAnchor="middle" fontSize="15" fontWeight="700" fill="#0a0a0a">{short(total)}</text>
      <text x="60" y="72" textAnchor="middle" fontSize="8" fill={LABEL}>Total</text>
    </svg>
  );
}
