"use client";

import type { Nav } from "@/components/calendar/types";
import type { GridData } from "@/lib/grid/types";

/** One tab per surface the network renders, plus the legend for what a tile's look means. */
export function SurfaceTabs({ data, nav }: { data: GridData; nav: Nav }) {
  return (
    <div className="flex items-center gap-6 overflow-x-auto border-b border-base-300 px-5" role="tablist">
      {data.surfaces.map((s) => {
        const active = s.key === data.surface;
        return (
          <button key={s.key} type="button" role="tab" aria-selected={active} onClick={() => nav({ surface: s.key, tile: null })} className={`flex items-center gap-2 whitespace-nowrap border-b-2 py-3.5 text-sm ${active ? "border-base-content font-semibold" : "border-transparent text-secondary hover:text-base-content"}`}>
            <span>{s.label}</span>
            <span className="rounded-full bg-base-200 px-2 py-0.5 text-xs text-secondary">{s.count}</span>
          </button>
        );
      })}
      <ul className="ml-auto hidden items-center gap-4 text-xs text-secondary md:flex" aria-label="Legend">
        <li className="flex items-center gap-1.5"><span aria-hidden className="block h-2.5 w-2.5 rounded-selector bg-base-content" />Live</li>
        <li className="flex items-center gap-1.5"><span aria-hidden className="block h-2.5 w-2.5 rounded-selector border-2 border-base-content" />Planned</li>
        <li className="flex items-center gap-1.5"><span aria-hidden className="block h-2.5 w-2.5 rounded-selector border border-dashed border-secondary" />Gap</li>
      </ul>
    </div>
  );
}
