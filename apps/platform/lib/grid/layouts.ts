/*
 * Grid layouts — how a network renders a profile page, recorded per SURFACE.
 *
 * Same rule as lib/media/canvas/specs.ts: a fact we could not read from the
 * network's own documentation is `verified: false`, and the page says where it
 * came from. None of the three networks publishes a machine-readable profile
 * layout; every entry below is observed in the product and dated, because
 * layouts change (Instagram moved profile tiles from 1:1 to 3:4 in January 2025).
 *
 * Pinned posts: none of the three APIs exposes pinned state, so every surface
 * orders by date and says so rather than guessing which tiles sit on top.
 */
import type { Network, PublishFormat } from "@rocketease/providers/client";

export const GRID_NETWORKS = ["instagram", "tiktok", "youtube", "mock"] as const;
export type GridNetwork = (typeof GRID_NETWORKS)[number];

export type GridLayout = {
  network: GridNetwork;
  surface: string;
  /** Tab label. */
  label: string;
  columns: number;
  /** Tile shape as width:height. */
  tile: { w: number; h: number };
  /** True where the network prints the title under each tile (YouTube). */
  titles: boolean;
  /** Formats that appear on this surface. Everything else is hidden from it. */
  formats: PublishFormat[];
  /** What people expect here that never shows, in words. */
  excludes: string;
  /** Why pinned tiles are not modelled. */
  pinnedNote: string;
  verified: boolean;
  sourceNote: string;
  checkedAt: string;
};

const CHECKED = "2026-09-05";
const PINNED_API = "The API does not say which posts are pinned, so this grid is in date order.";

const IG_NOTE = "Observed in the Instagram app; Instagram publishes no layout spec. Profile tiles became 3:4 in January 2025.";
const TT_NOTE = "Observed in the TikTok app; TikTok publishes no layout spec.";
const YT_NOTE = "Observed on youtube.com at desktop width; YouTube publishes no layout spec.";

export const GRID_LAYOUTS: GridLayout[] = [
  { network: "instagram", surface: "posts", label: "Posts", columns: 3, tile: { w: 3, h: 4 }, titles: false, formats: ["image", "carousel", "video", "reel"], excludes: "Stories never appear in the grid. A Reel shows here unless its author hid it from the profile, which the API cannot tell us.", pinnedNote: PINNED_API, verified: false, sourceNote: IG_NOTE, checkedAt: CHECKED },
  { network: "instagram", surface: "reels", label: "Reels", columns: 3, tile: { w: 3, h: 4 }, titles: false, formats: ["reel", "video"], excludes: "Only Reels. Images and carousels stay on the Posts tab.", pinnedNote: PINNED_API, verified: false, sourceNote: IG_NOTE, checkedAt: CHECKED },
  { network: "tiktok", surface: "profile", label: "Videos", columns: 3, tile: { w: 3, h: 4 }, titles: false, formats: ["video", "carousel", "image"], excludes: "Private and friends-only videos are not shown to visitors, and the API does not tell us which those are.", pinnedNote: PINNED_API, verified: false, sourceNote: TT_NOTE, checkedAt: CHECKED },
  { network: "youtube", surface: "videos", label: "Videos", columns: 4, tile: { w: 16, h: 9 }, titles: true, formats: ["video"], excludes: "Shorts have their own tab.", pinnedNote: "YouTube has no pinned videos; a channel trailer is set separately and is not modelled here.", verified: false, sourceNote: YT_NOTE, checkedAt: CHECKED },
  { network: "youtube", surface: "shorts", label: "Shorts", columns: 4, tile: { w: 9, h: 16 }, titles: true, formats: ["reel"], excludes: "Only Shorts. Regular uploads stay on the Videos tab.", pinnedNote: "YouTube has no pinned Shorts.", verified: false, sourceNote: YT_NOTE, checkedAt: CHECKED },
  // The demo network mirrors Instagram so the local loop exercises the same shape.
  { network: "mock", surface: "profile", label: "Posts", columns: 3, tile: { w: 3, h: 4 }, titles: false, formats: ["image", "carousel", "video", "reel"], excludes: "Text-only posts have no tile.", pinnedNote: "The demo network has no pinned posts.", verified: true, sourceNote: "Defined by the mock adapter.", checkedAt: CHECKED },
];

export function isGridNetwork(network: string): network is GridNetwork {
  return (GRID_NETWORKS as readonly string[]).includes(network);
}

export function layoutsFor(network: Network | string): GridLayout[] {
  return GRID_LAYOUTS.filter((l) => l.network === network);
}

export function layoutFor(network: Network | string, surface: string | undefined): GridLayout | null {
  const all = layoutsFor(network);
  return all.find((l) => l.surface === surface) ?? all[0] ?? null;
}

/** "3:4" — the shape people know the network by. */
export const aspectLabel = (tile: GridLayout["tile"]) => `${tile.w}:${tile.h}`;

/** The layout in one line, for the facts box. */
export function describeLayout(l: GridLayout): string {
  return `${l.columns} columns · ${aspectLabel(l.tile)} tiles · newest first${l.titles ? " · titles under tiles" : ""}`;
}
