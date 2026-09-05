/*
 * Pure presentation arithmetic for the notifications center: day buckets in
 * the workspace's timezone, the "when" label, and page maths. No I/O.
 */
import { dayKey, formatInZone } from "@/lib/time";

export const PAGE_SIZE = 20;
export type DayBucket = "Today" | "Yesterday" | "Earlier";

const shift = (day: string, days: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export function bucketFor(at: Date, now: Date, tz: string): DayBucket {
  const today = dayKey(now, tz);
  const day = dayKey(at, tz);
  if (day === today) return "Today";
  if (day === shift(today, -1)) return "Yesterday";
  return "Earlier";
}

/** Today: the time. This week: weekday and time. Older: the date. */
export function whenLabel(at: Date, now: Date, tz: string): string {
  const bucket = bucketFor(at, now, tz);
  if (bucket === "Today") return formatInZone(at, tz, { timeStyle: "short" });
  const ageDays = (Date.parse(dayKey(now, tz)) - Date.parse(dayKey(at, tz))) / 86_400_000;
  if (ageDays < 7) return formatInZone(at, tz, { weekday: "short", hour: "numeric", minute: "2-digit" });
  return formatInZone(at, tz, { month: "short", day: "numeric" });
}

export type Paging = { page: number; pages: number; from: number; to: number; total: number };

export function paging(total: number, requested: number, size = PAGE_SIZE): Paging {
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(Math.max(1, Math.floor(requested) || 1), pages);
  const from = total === 0 ? 0 : (page - 1) * size + 1;
  const to = Math.min(total, page * size);
  return { page, pages, from, to, total };
}

/** Page numbers to show: always first and last, and a window of two around the current page. */
export function pageNumbers(page: number, pages: number): (number | "gap")[] {
  const wanted = new Set<number>([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const sorted = [...wanted].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  for (const [i, n] of sorted.entries()) {
    if (i > 0 && n - sorted[i - 1] > 1) out.push("gap");
    out.push(n);
  }
  return out;
}

/** Group a page of rows by day bucket, preserving order. */
export function groupByDay<T extends { createdAt: Date }>(rows: T[], now: Date, tz: string): { bucket: DayBucket; rows: T[] }[] {
  const out: { bucket: DayBucket; rows: T[] }[] = [];
  for (const row of rows) {
    const bucket = bucketFor(row.createdAt, now, tz);
    const last = out[out.length - 1];
    if (last && last.bucket === bucket) last.rows.push(row);
    else out.push({ bucket, rows: [row] });
  }
  return out;
}
