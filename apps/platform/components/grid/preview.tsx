"use client";

import Link from "next/link";
import { buttonClasses } from "@wizeworks/silicaui-react/server";
import type { GridData, GridGap, GridPost } from "@/lib/grid/types";
import { workspacePath } from "@/lib/nav";
import { GapTile, PostTile } from "./tile";

/** What is being dragged: a scheduled tile, or a draft from the tray. */
export type Drag = { kind: "post"; post: GridPost } | { kind: "draft"; itemId: string; title: string };

type Props = {
  data: GridData;
  drag: Drag | null;
  setDrag: (d: Drag | null) => void;
  onSelect: (post: GridPost) => void;
  onDropOnPost: (target: GridPost) => void;
  onDropOnGap: (gap: GridGap) => void;
};

/** The profile as the network lays it out: header, then tiles in the layout's columns. */
export function GridPreview({ data, drag, setDrag, onSelect, onDropOnPost, onDropOnGap }: Props) {
  const { layout, channel, stats } = data;
  const phone = layout.columns === 3 && !layout.titles;
  const canSwap = (p: GridPost) => drag?.kind === "post" && p.state === "scheduled" && drag.post.variantId !== p.variantId;
  const canFill = Boolean(drag);
  const over = (e: React.DragEvent) => e.preventDefault();
  const dragProps = (p: GridPost) => (data.canPublish && p.state === "scheduled" ? { draggable: true, onDragStart: () => setDrag({ kind: "post", post: p }), onDragEnd: () => setDrag(null) } : {});

  return (
    <div className={`flex w-full flex-col ${phone ? "max-w-100" : ""}`}>
      <div className="mb-4 flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-base-300 text-base font-semibold text-secondary">
          {channel.avatarUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={channel.avatarUrl} alt="" className="h-full w-full object-cover" /> : channel.name.slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0">
          <div className="truncate text-base font-semibold">{channel.handle ?? channel.name}</div>
          <div className="text-sm text-secondary">{stats.live} live · {stats.planned} planned · {stats.gaps} {stats.gaps === 1 ? "gap" : "gaps"}</div>
        </div>
      </div>
      <div className="mb-2 text-xs text-secondary">{phone ? "Phone view" : "Desktop view"} · {layout.columns} across · newest first</div>
      {data.tiles.length === 0 ? (
        <Empty workspaceId={data.workspaceId} canCreate={data.canCreate} />
      ) : (
        <div className={`grid ${layout.titles ? "gap-4" : "gap-0.5"}`} style={{ gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))` }}>
          {data.tiles.map((t) =>
            t.kind === "gap" ? (
              <GapTile key={t.key} gap={t} layout={layout} workspaceId={data.workspaceId} canCreate={data.canCreate} canDrop={canFill} onDragOver={over} onDrop={() => onDropOnGap(t)} />
            ) : (
              <PostTile key={t.key} post={t} layout={layout} selected={data.selected?.post.variantId === t.variantId} canDrop={canSwap(t)} onSelect={() => onSelect(t)} onDragOver={over} onDrop={() => onDropOnPost(t)} {...dragProps(t)} />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function Empty({ workspaceId, canCreate }: { workspaceId: string; canCreate: boolean }) {
  return (
    <div className="rounded-box border border-dashed border-base-300 px-6 py-12 text-center">
      <p className="text-sm font-medium">Nothing on this grid yet.</p>
      <p className="mt-1 text-sm text-secondary">Posts you publish or schedule to this profile appear here as tiles.</p>
      {canCreate && <Link href={workspacePath(workspaceId, "create")} className={`${buttonClasses({ color: "primary", size: "sm" })} mt-4`}>Create post</Link>}
    </div>
  );
}
