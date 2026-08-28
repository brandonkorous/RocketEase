/*
 * Timezone helpers without a dependency: the workspace's scheduling timezone
 * is explicit everywhere (data-model.md), storage is UTC.
 */

/** Offset (minutes) of `tz` at the given UTC instant. */
function offsetMinutes(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return (asUtc - at.getTime()) / 60_000;
}

/** "2026-05-14T09:15" in `tz` → UTC Date. Handles DST by iterating once. */
export function zonedToUtc(local: string, tz: string): Date {
  const [d, t = "00:00"] = local.split("T");
  const [y, m, day] = d.split("-").map(Number);
  const [hh, mm] = t.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, day, hh, mm);
  let off = offsetMinutes(tz, new Date(guess));
  let utc = guess - off * 60_000;
  const off2 = offsetMinutes(tz, new Date(utc));
  if (off2 !== off) utc = guess - off2 * 60_000;
  return new Date(utc);
}

/** UTC Date → "YYYY-MM-DDTHH:mm" in `tz` (for datetime-local inputs). */
export function utcToZonedInput(at: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function formatInZone(at: Date, tz: string, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" }) {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, ...opts }).format(at);
}

/** Calendar day key "YYYY-MM-DD" in tz. */
export function dayKey(at: Date, tz: string) {
  return utcToZonedInput(at, tz).slice(0, 10);
}
