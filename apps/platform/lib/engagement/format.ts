import { formatInZone } from "@/lib/time";

/** "2m", "3h", "2d", else a short date — the queue-row style in the mockup. */
export function relativeLabel(at: Date, tz: string, now = Date.now()) {
  const diff = Math.max(0, now - at.getTime());
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return formatInZone(at, tz, { month: "short", day: "numeric" });
}

export function minutesLabel(min: number | null) {
  if (min === null) return "—";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  return `${h}h ${min % 60}m`;
}

export const KIND_LABEL: Record<string, string> = { comment: "Comment", mention: "Mention", message: "Message", review: "Review" };
