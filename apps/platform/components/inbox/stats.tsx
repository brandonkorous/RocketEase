import type { InboxStats } from "@/lib/engagement/queries";
import { minutesLabel } from "@/lib/engagement/format";

function Sparkline({ points }: { points: number[] }) {
  const w = 96;
  const h = 32;
  const max = Math.max(1, ...points);
  const d = points.map((v, i) => `${i === 0 ? "M" : "L"}${((i / (points.length - 1)) * w).toFixed(1)},${(h - (v / max) * (h - 4) - 2).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-24 shrink-0" aria-hidden="true">
      <path d={d} fill="none" className="stroke-base-content" strokeWidth="1.5" strokeLinejoin="round" />
      {points.map((v, i) => (<circle key={i} cx={(i / (points.length - 1)) * w} cy={h - (v / max) * (h - 4) - 2} r="1.5" className="fill-base-content" />))}
    </svg>
  );
}

/** Stat row from the mockup: only numbers we actually measure (no satisfaction/conversions yet). */
export function InboxStatsRow({ stats }: { stats: InboxStats }) {
  const cards = [
    { label: "Average first response", value: minutesLabel(stats.avgFirstResponseMinutes), note: "Last 7 days" },
    { label: "Unresolved conversations", value: String(stats.unresolved), note: stats.overdue ? `${stats.overdue} past response target` : "None past response target", warn: stats.overdue > 0 },
    { label: "Assigned to you", value: String(stats.assignedToMe), note: "Open or snoozed" },
    { label: "Resolved this week", value: String(stats.resolvedThisWeek), note: "Last 7 days" },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="flex items-center justify-between gap-3 rounded-box border border-base-300 p-4">
          <div className="min-w-0">
            <div className="text-sm text-secondary">{c.label}</div>
            <div className="mt-1 text-2xl font-bold tracking-tight">{c.value}</div>
            <div className={`mt-1 text-xs ${c.warn ? "text-error" : "text-secondary/70"}`}>{c.note}</div>
          </div>
          <Sparkline points={stats.inboundByDay} />
        </div>
      ))}
    </div>
  );
}
