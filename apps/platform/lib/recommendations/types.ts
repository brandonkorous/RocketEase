/*
 * Facts in, drafts out. Rules (lib/recommendations/rules/*) are pure functions
 * over this shape so they can be unit-tested without a database, and so every
 * number a user sees can be traced to a stored fact.
 */
import type { Confidence, Evidence, RecommendationAction, RecommendationKind } from "@/db/schema/recommendations";

export type PostFact = {
  itemId: string;
  title: string;
  remoteId: string;
  channelId: string;
  publishedAt: Date;
  /** Publication moment resolved into the workspace timezone (day key, 0=Sun, 0–23). */
  day: string;
  weekday: number;
  hour: number;
  format: string;
  reach: number;
  engagement: number;
  clicks: number;
};

export type DayFact = { day: string; value: number };

export type ChannelFacts = {
  channelId: string;
  name: string;
  network: string;
  /** Posts published inside the window that have post-level facts. */
  posts: PostFact[];
  reachByDay: DayFact[];
  engagementByDay: DayFact[];
  followerGainByDay: DayFact[];
};

/** Response load for the workspace inbox; `targetMinutes` comes from workspace settings. */
export type InboxFacts = {
  open: number;
  unanswered: number;
  overdue: number;
  medianFirstResponseMinutes: number | null;
  targetMinutes: number | null;
  answeredSample: number;
};

export type WorkspaceFacts = {
  workspaceId: string;
  organizationId: string;
  timezone: string;
  /** Absolute analysis window (day keys in the workspace timezone). */
  period: { from: string; to: string };
  today: string;
  channels: ChannelFacts[];
  inbox: InboxFacts;
};

export type RecommendationDraft = {
  kind: RecommendationKind;
  target: string;
  title: string;
  body: string;
  evidence: Evidence;
  confidence: Confidence;
  action?: RecommendationAction;
  channelId?: string;
  contentItemId?: string;
};

export type Rule = (f: WorkspaceFacts) => RecommendationDraft[];

/** Minimum samples before anything is scored. Below these we say "not enough data". */
export const MIN = { postsPerChannel: 8, postsPerBucket: 3, postsPerFormat: 3, daysPerWindow: 7, answeredConversations: 5 };

export const DAY_MS = 86_400_000;

/** engagement ÷ reach (analytics.md metric contract); null when reach is missing. */
export const engagementRate = (p: { engagement: number; reach: number }) => (p.reach > 0 ? p.engagement / p.reach : null);

export const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Values in [from, to] inclusive (day keys sort lexicographically). */
export const inRange = (days: DayFact[], from: string, to: string) => days.filter((d) => d.day >= from && d.day <= to);

export const round = (v: number, places = 4) => Number(v.toFixed(places));

/** Whole days between two day keys ("2026-08-01" → "2026-08-04" = 3). */
export const daysBetweenKeys = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

export const shiftKey = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
