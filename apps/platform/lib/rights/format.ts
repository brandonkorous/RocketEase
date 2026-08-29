/*
 * Date wording shared by the rules and the rights UI.
 */
import { DAY_MS } from "./types";

/** "12 Mar 2026" in the given zone (UTC when none is supplied). */
export function day(at: Date, timeZone = "UTC") {
  return new Intl.DateTimeFormat("en-US", { timeZone, day: "numeric", month: "short", year: "numeric" }).format(at);
}

/** Whole days from `from` to `to`; negative once `to` is in the past. */
export function daysUntil(to: Date, from: Date = new Date()) {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

/** "3 days left" / "today" / "expired 2 days ago" — icon + label, never colour alone. */
export function remainingLabel(to: Date, from: Date = new Date()) {
  const d = daysUntil(to, from);
  if (d < 0) return `Expired ${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"} ago`;
  if (d === 0) return "Expires today";
  return `${d} day${d === 1 ? "" : "s"} left`;
}
