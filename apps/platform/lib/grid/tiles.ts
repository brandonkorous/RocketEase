/*
 * The grid's arithmetic, with no database in it.
 *
 * A gap is not a feeling. It is a stretch longer than the channel's rhythm with
 * nothing in it, where the rhythm is the median spacing of recent live posts.
 * Fewer than three live posts means no rhythm, and no rhythm means no gaps —
 * an unknown is never shown as a zero.
 */
import { addDays } from "@/components/calendar/types";
import type { GridGap, GridPost, GridTile, PostState } from "./types";

export const MIN_LIVE_FOR_RHYTHM = 3;
export const MAX_CADENCE_DAYS = 7;
export const MAX_GAPS = 6;
export const DEFAULT_TIME = "09:00";

type Statusy = { status: string; approvalState: string; itemStatus: string };

/** Variant state is authoritative; approval only refines a draft. */
export function postState(v: Statusy): PostState {
  if (v.status === "published") return "live";
  if (v.status === "scheduled" || v.status === "publishing") return "scheduled";
  if (v.status === "failed") return "failed";
  if (v.approvalState === "pending" || v.itemStatus === "in_review") return "review";
  return "draft";
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const uniqSorted = (days: string[]) => [...new Set(days)].sort();

/** Median spacing in days between live posts, clamped to 1..7; null below the sample floor. Two posts on one day are a day apart, never zero. */
export function inferCadenceDays(liveDays: string[]): number | null {
  const days = [...liveDays].sort();
  if (days.length < MIN_LIVE_FOR_RHYTHM) return null;
  const spacings = days.slice(1).map((d, i) => Math.max(1, daysBetween(days[i], d))).sort((a, b) => a - b);
  const mid = Math.floor(spacings.length / 2);
  const median = spacings.length % 2 ? spacings[mid] : (spacings[mid - 1] + spacings[mid]) / 2;
  return Math.min(MAX_CADENCE_DAYS, Math.max(1, Math.round(median)));
}

/** Median clock time of live posts, rounded to the half hour. */
export function usualTime(liveTimes: string[]): string {
  const mins = liveTimes.map((t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b);
  if (mins.length < MIN_LIVE_FOR_RHYTHM) return DEFAULT_TIME;
  const m = Math.round(mins[Math.floor(mins.length / 2)] / 30) * 30 % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export type GapInput = { liveDays: string[]; plannedDays: string[]; today: string; cadenceDays: number | null };

/**
 * Future days where the next post is more than `cadenceDays` after the one before
 * it, walking from the last post through the planning window. The window ends
 * at the last planned post or one rhythm past today, whichever is later.
 */
export function findGaps({ liveDays, plannedDays, today, cadenceDays }: GapInput): string[] {
  if (!cadenceDays) return [];
  const planned = uniqSorted(plannedDays).filter((d) => d > today);
  const lastLive = uniqSorted(liveDays).filter((d) => d <= today).at(-1);
  const windowEnd = [planned.at(-1) ?? today, addDays(today, cadenceDays)].sort().at(-1)!;
  const gaps: string[] = [];
  let prev = lastLive ?? today;
  const push = (day: string) => { if (day > today && gaps.length < MAX_GAPS) gaps.push(day); };
  for (const next of planned) {
    while (daysBetween(prev, next) > cadenceDays && gaps.length < MAX_GAPS) { prev = addDays(prev, cadenceDays); push(prev); }
    prev = next;
  }
  while (daysBetween(prev, windowEnd) >= cadenceDays && gaps.length < MAX_GAPS) { prev = addDays(prev, cadenceDays); push(prev); }
  return gaps;
}

/** Whole days from `now` to the latest planned instant; never negative. */
export function daysAhead(plannedAt: string[], now: Date): number {
  const latest = Math.max(...plannedAt.map((s) => Date.parse(s)).filter((n) => !Number.isNaN(n)), Number.NEGATIVE_INFINITY);
  return Number.isFinite(latest) ? Math.max(0, Math.floor((latest - now.getTime()) / 86_400_000)) : 0;
}

/** Posts and gaps in one list, newest first by local day then time. Undated posts drop out: they have no place on the profile. */
export function buildTiles(posts: GridPost[], gapDays: string[], gapTime: string): GridTile[] {
  const gaps: GridGap[] = gapDays.map((d) => ({ kind: "gap", key: `gap:${d}`, localDay: d, localTime: gapTime }));
  const dated = posts.filter((p) => p.localDay);
  return [...dated, ...gaps].sort((a, b) => `${b.localDay}T${b.localTime ?? ""}`.localeCompare(`${a.localDay}T${a.localTime ?? ""}`));
}
