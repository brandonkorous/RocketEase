"use client";

import Link from "next/link";
import { buttonClasses } from "@wizeworks/silicaui-react/server";
import type { GridData } from "@/lib/grid/types";
import { workspacePath } from "@/lib/nav";
import type { Nav } from "@/components/calendar/types";
import { NETWORK_LABEL } from "./format";

export function GridHeader({ data, nav }: { data: GridData; nav: Nav }) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <h1 className="app-title">Grid</h1>
        <p className="mt-1 text-base text-secondary">The profile as it will look, with planned posts in place.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select className="select select-sm w-auto" value={data.channel.id} onChange={(e) => nav({ channel: e.target.value, surface: null, tile: null })} aria-label="Profile">
          {data.channels.map((c) => (
            <option key={c.id} value={c.id}>{NETWORK_LABEL[c.network]} · {c.handle ?? c.name}</option>
          ))}
        </select>
        {data.canCreate && <Link href={workspacePath(data.workspaceId, "create")} className={buttonClasses({ color: "primary" })}>+ Create post</Link>}
      </div>
    </div>
  );
}
