/*
 * Slot presentation helpers. Plain module (no database, no server-only) so the
 * composer's client card and the worker can both use it.
 */
export type SlotView = { channelId: string; weekday: number; hour: number; score: number; sampleSize: number };

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const weekdayLabel = (weekday: number) => WEEKDAYS[((weekday % 7) + 7) % 7];

export function hourLabel(hour: number) {
  const h = ((hour % 24) + 24) % 24;
  const suffix = h < 12 ? "am" : "pm";
  return `${h % 12 === 0 ? 12 : h % 12}${suffix}`;
}

export const slotLabel = (s: { weekday: number; hour: number }) => `${weekdayLabel(s.weekday)} ${hourLabel(s.hour)}`;

/** Weekday (0=Sun) and hour of an instant in `tz`, plus its day key. */
export function zonedSlot(at: Date, tz: string): { day: string; weekday: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, hourCycle: "h23", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit" }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const idx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday").slice(0, 3));
  return { day: `${get("year")}-${get("month")}-${get("day")}`, weekday: idx < 0 ? 0 : idx, hour: Number(get("hour")) };
}

/**
 * Next date (in `tz`) on which the slot occurs, as the composer's date/time
 * inputs expect. `from` defaults to now; a slot later today is kept for today.
 */
export function nextOccurrence(slot: { weekday: number; hour: number }, tz: string, from: Date = new Date()): { date: string; time: string } {
  const here = zonedSlot(from, tz);
  let ahead = (slot.weekday - here.weekday + 7) % 7;
  if (ahead === 0 && slot.hour <= here.hour) ahead = 7;
  const date = new Date(Date.parse(`${here.day}T00:00:00Z`) + ahead * 86_400_000).toISOString().slice(0, 10);
  return { date, time: `${String(slot.hour).padStart(2, "0")}:00` };
}
