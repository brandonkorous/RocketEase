"use client";

import Link from "next/link";
import type { GridLayout } from "@/lib/grid/layouts";
import type { GridGap, GridPost } from "@/lib/grid/types";
import { workspacePath } from "@/lib/nav";
import { longDay, stateLabel, time12, weekday } from "./format";
import { GridIcon } from "./icons";

export type DropProps = { onDragOver?: (e: React.DragEvent) => void; onDrop?: () => void };
type DragProps = { draggable?: boolean; onDragStart?: () => void; onDragEnd?: () => void };

type TileProps = {
  post: GridPost;
  layout: GridLayout;
  selected: boolean;
  /** True while something is being dragged that could land here. */
  canDrop: boolean;
  onSelect: () => void;
} & DragProps & DropProps;

const aspect = (l: GridLayout) => ({ aspectRatio: `${l.tile.w} / ${l.tile.h}` });

export function PostTile({ post, layout, selected, canDrop, onSelect, draggable, onDragStart, onDragEnd, onDragOver, onDrop }: TileProps) {
  const pill = stateLabel(post);
  const label = `${post.title}, ${pill ? pill.label : "live"}${selected ? ", selected" : ""}`;
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${layout.titles ? "" : ""}`} onDragOver={canDrop ? onDragOver : undefined} onDrop={canDrop ? onDrop : undefined}>
      <button
        type="button"
        onClick={onSelect}
        aria-label={label}
        aria-pressed={selected}
        draggable={draggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        style={aspect(layout)}
        className={`relative block w-full overflow-hidden bg-base-200 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content ${layout.titles ? "rounded-field" : ""} ${draggable ? "cursor-grab" : ""} ${canDrop ? "ring-2 ring-inset ring-base-content/40" : ""}`}
      >
        {post.thumbUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={post.thumbUrl} alt="" className="h-full w-full object-cover" draggable={false} /> : <Placeholder />}
        {post.isVideo && <span className="absolute right-2 top-2 flex text-base-100 drop-shadow">{GridIcon.reel}</span>}
        {pill && <Pill icon={pill.icon} label={pill.label} />}
        {selected && <SelectedRing />}
      </button>
      {layout.titles && (
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{post.title}</div>
          <div className="truncate text-xs text-secondary">{post.state === "live" ? `Live · ${post.localDay ? longDay(post.localDay) : ""}` : pill?.label}</div>
        </div>
      )}
    </div>
  );
}

function Placeholder() {
  return <span className="flex h-full w-full items-center justify-center text-secondary/50">{GridIcon.image}</span>;
}

function Pill({ icon, label }: { icon: keyof typeof GridIcon; label: string }) {
  return (
    <span className="absolute bottom-2 left-2 right-2 flex">
      <span className="flex max-w-full items-center gap-1 rounded-selector bg-base-content/85 px-1.5 py-0.5 text-xs font-semibold text-base-100">
        <span className="flex shrink-0">{GridIcon[icon]}</span>
        <span className="truncate">{label}</span>
      </span>
    </span>
  );
}

function SelectedRing() {
  return (
    <>
      <span aria-hidden className="pointer-events-none absolute inset-0 border-3 border-base-content" />
      <span aria-hidden className="pointer-events-none absolute inset-0.75 border-2 border-base-100" />
    </>
  );
}

type GapProps = { gap: GridGap; layout: GridLayout; workspaceId: string; canDrop: boolean; canCreate: boolean } & DropProps;

/** A day the rhythm expects a post. Drop a draft or a scheduled post here, or start a new one. */
export function GapTile({ gap, layout, workspaceId, canDrop, canCreate, onDragOver, onDrop }: GapProps) {
  const when = `${weekday(gap.localDay)}, ${longDay(gap.localDay).split(", ")[1] ?? gap.localDay} · ${time12(gap.localTime)}`;
  const inner = (
    <>
      <span className="flex text-secondary">{GridIcon.plus}</span>
      <span className="text-xs font-semibold">Gap</span>
      <span className="text-xs text-secondary">{when}</span>
    </>
  );
  const cls = `flex w-full flex-col items-center justify-center gap-1 border border-dashed border-secondary/60 bg-base-200 text-center ${layout.titles ? "rounded-field" : ""} ${canDrop ? "ring-2 ring-inset ring-base-content/40" : ""}`;
  return (
    <div className="flex min-w-0 flex-col gap-1.5" onDragOver={canDrop ? onDragOver : undefined} onDrop={canDrop ? onDrop : undefined}>
      {canCreate ? (
        <Link href={workspacePath(workspaceId, "create")} style={aspect(layout)} className={`${cls} hover:border-base-content`} aria-label={`Gap on ${when}. Create a post.`}>{inner}</Link>
      ) : (
        <div style={aspect(layout)} className={cls} aria-label={`Gap on ${when}`}>{inner}</div>
      )}
      {layout.titles && <div className="text-sm text-secondary">Nothing planned</div>}
    </div>
  );
}
