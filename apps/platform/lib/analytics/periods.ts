import type { ReportFilters } from "@/db/schema/analytics";
import { dayKey } from "@/lib/time";

export type Preset = "7d" | "28d" | "90d" | "custom";
export type AnalyticsFilters = ReportFilters & { preset: Preset };
type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const DAY = 86_400_000;
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export const shiftDay = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY) + 1;

/** Filters from the URL; the default is the last 28 full days in the workspace timezone. */
export function parseAnalyticsFilters(sp: Search, tz: string): AnalyticsFilters {
  const today = dayKey(new Date(), tz);
  const yesterday = shiftDay(today, -1);
  const preset = (["7d", "28d", "90d", "custom"].includes(one(sp.range)) ? one(sp.range) : "28d") as Preset;
  let from = one(sp.from);
  let to = one(sp.to);
  if (preset !== "custom" || !isDay(from) || !isDay(to) || from > to) {
    const n = preset === "7d" ? 7 : preset === "90d" ? 90 : 28;
    to = yesterday;
    from = shiftDay(to, -(n - 1));
  }
  const compare = (["previous", "year", "none"].includes(one(sp.compare)) ? one(sp.compare) : "previous") as ReportFilters["compare"];
  const scope = (["all", "organic", "paid"].includes(one(sp.scope)) ? one(sp.scope) : "all") as ReportFilters["scope"];
  return { preset, from, to, compare, scope, channelId: one(sp.channel) || undefined, campaignId: one(sp.campaign) || undefined };
}

/** Comparison window: previous equal-length period or the same dates a year earlier. */
export function comparisonPeriod(f: ReportFilters): { from: string; to: string } | null {
  if (f.compare === "none") return null;
  if (f.compare === "year") return { from: shiftDay(f.from, -365), to: shiftDay(f.to, -365) };
  const len = daysBetween(f.from, f.to);
  return { from: shiftDay(f.from, -len), to: shiftDay(f.from, -1) };
}

/** Absolute + relative change; zero denominators are "new", never infinity (analytics.md). */
export function delta(current: number | null, previous: number | null): { abs: number; pct: number | null; label: string } | null {
  if (current === null || previous === null) return null;
  const abs = current - previous;
  if (previous === 0) return { abs, pct: null, label: current === 0 ? "no change" : "new" };
  const pct = abs / previous;
  return { abs, pct, label: `${pct >= 0 ? "↑" : "↓"} ${Math.abs(pct * 100).toFixed(1)}%` };
}

export function periodLabel(p: { from: string; to: string }) {
  const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${fmt(p.from)} – ${fmt(p.to)}`;
}

export function filtersToQuery(f: AnalyticsFilters) {
  const q = new URLSearchParams();
  q.set("range", f.preset);
  if (f.preset === "custom") { q.set("from", f.from); q.set("to", f.to); }
  if (f.compare !== "previous") q.set("compare", f.compare);
  if (f.scope !== "all") q.set("scope", f.scope);
  if (f.channelId) q.set("channel", f.channelId);
  if (f.campaignId) q.set("campaign", f.campaignId);
  return q.toString();
}
