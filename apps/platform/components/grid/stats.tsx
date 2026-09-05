"use client";

import { describeLayout } from "@/lib/grid/layouts";
import { MIN_LIVE_FOR_RHYTHM } from "@/lib/grid/tiles";
import { GRID_DEFINITIONS, type GridData } from "@/lib/grid/types";
import { NETWORK_LABEL, time12 } from "./format";

/** Four numbers, each with its definition on hover, and the layout facts beside them. */
export function StatsRow({ data }: { data: GridData }) {
  const { stats, layout, rhythm } = data;
  const cells: [string, number, string][] = [
    ["Live", stats.live, GRID_DEFINITIONS.live],
    ["Planned", stats.planned, GRID_DEFINITIONS.planned],
    [stats.gaps === 1 ? "Gap" : "Gaps", stats.gaps, GRID_DEFINITIONS.gaps],
    ["Days ahead", stats.daysAhead, GRID_DEFINITIONS.daysAhead],
  ];
  return (
    <div className="mt-5 flex flex-col gap-2">
      <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
        <dl className="grid grid-cols-2 divide-base-300 rounded-box border border-base-300 sm:grid-cols-4 sm:divide-x">
          {cells.map(([label, n, def]) => (
            <div key={label} className="flex items-center gap-3 px-4 py-3" title={def}>
              <dd className="order-first text-2xl font-bold leading-none">{n}</dd>
              <dt className="text-sm text-secondary">{label}</dt>
            </div>
          ))}
        </dl>
        <div className="rounded-box border border-base-300 px-4 py-3">
          <div className="text-sm text-secondary">{NETWORK_LABEL[data.channel.network]} · {layout.label} grid</div>
          <div className="mt-1 text-sm font-semibold leading-snug">{describeLayout(layout)}</div>
          <div className="mt-0.5 text-xs leading-relaxed text-secondary">{layout.excludes} {layout.pinnedNote} Layout checked {layout.checkedAt}{layout.verified ? "" : ", observed rather than published"}.</div>
        </div>
      </div>
      <p className="text-xs text-secondary" title={GRID_DEFINITIONS.rhythm}>
        {rhythm.cadenceDays
          ? `Rhythm: a post every ${rhythm.cadenceDays === 1 ? "day" : `${rhythm.cadenceDays} days`}, from your last ${rhythm.liveSample} live posts here. Usual time ${time12(rhythm.usualTime)}. A gap is a stretch longer than that with nothing planned.`
          : `Publish ${MIN_LIVE_FOR_RHYTHM} posts to this profile and Grid learns your rhythm. Gaps appear after that.`}
      </p>
    </div>
  );
}
