/*
 * Usage periods. A workspace's month is its own month: the boundary is midnight
 * in the workspace timezone, converted to the UTC instants the ledger stores.
 */
import { dayKey, zonedToUtc } from "@/lib/time";

export type UsagePeriod = { from: Date; to: Date };
/** Half-open [from, to); `resetsAt` is the next month's start, i.e. `to`. */
export type MonthWindow = UsagePeriod & { month: string; resetsAt: Date };

const pad = (n: number) => String(n).padStart(2, "0");

/** Calendar month key "YYYY-MM" for an instant, as the workspace sees it. */
export const monthOf = (at: Date, timezone: string) => dayKey(at, timezone).slice(0, 7);

export function monthWindow(month: string, timezone: string): MonthWindow {
  const [y, m] = month.split("-").map(Number);
  const from = zonedToUtc(`${y}-${pad(m)}-01T00:00`, timezone);
  const nextYear = m === 12 ? y + 1 : y;
  const nextMonth = m === 12 ? 1 : m + 1;
  const to = zonedToUtc(`${nextYear}-${pad(nextMonth)}-01T00:00`, timezone);
  return { month, from, to, resetsAt: to };
}

export const currentMonthWindow = (timezone: string, now = new Date()): MonthWindow => monthWindow(monthOf(now, timezone), timezone);
