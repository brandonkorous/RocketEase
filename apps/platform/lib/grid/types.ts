/*
 * Grid view model — shared by the server loader and the client screen.
 * Every date here is already in the workspace's zone as `localDay` (YYYY-MM-DD)
 * and `localTime` (HH:MM); the client never converts.
 */
import type { CoverSupport, PublishFormat } from "@rocketease/providers/client";
import type { GridLayout, GridNetwork } from "./layouts";

/** What a tile IS on the profile. Live tiles are locked; everything else is planned. */
export type PostState = "live" | "scheduled" | "draft" | "review" | "failed";

export type GridPost = {
  kind: "post";
  key: string;
  itemId: string;
  variantId: string;
  title: string;
  text: string;
  format: PublishFormat;
  state: PostState;
  localDay: string | null;
  localTime: string | null;
  /** UTC instant the tile sorts by: publishedAt for live, scheduledAt otherwise. */
  at: string | null;
  thumbUrl: string | null;
  isVideo: boolean;
  remoteUrl: string | null;
  /** The video asset a cover frame would come from, when the post has one. */
  videoAssetId: string | null;
  coverOffsetMs: number | null;
};

/** A day the channel's rhythm expects a post and nothing is planned. */
export type GridGap = { kind: "gap"; key: string; localDay: string; localTime: string };

export type GridTile = GridPost | GridGap;

export type GridFrame = { id: string; offsetMs: number; url: string };

export type GridSelected = {
  post: GridPost;
  /** Candidate cover frames already pulled for the post's video; empty until asked for. */
  frames: GridFrame[];
  coverSupport: CoverSupport;
  coverReason: string | null;
};

export type GridChannel = { id: string; name: string; handle: string | null; avatarUrl: string | null; network: GridNetwork };

export type GridData = {
  workspaceId: string;
  timezone: string;
  today: string;
  channel: GridChannel;
  channels: GridChannel[];
  surface: string;
  surfaces: { key: string; label: string; count: number }[];
  layout: GridLayout;
  tiles: GridTile[];
  stats: { live: number; planned: number; gaps: number; daysAhead: number };
  /** The rhythm the gaps are computed from, so the page can define them. */
  rhythm: { cadenceDays: number | null; usualTime: string; liveSample: number };
  drafts: { itemId: string; title: string; text: string }[];
  selected: GridSelected | null;
  canPublish: boolean;
  canCreate: boolean;
};

/** Definitions the page shows next to each number. Every number has one. */
export const GRID_DEFINITIONS = {
  live: "Posts this channel has published, as far back as the grid shows.",
  planned: "Scheduled, draft and in-review posts with a date on this channel.",
  gaps: "Days your rhythm expects a post and nothing is planned.",
  daysAhead: "Days from today to the last planned post on this channel.",
  rhythm: "The median number of days between your last live posts here, from three or more posts.",
} as const;
