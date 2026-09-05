import { fmtDay } from "@/components/calendar/types";
import type { GridNetwork } from "@/lib/grid/layouts";
import type { GridPost } from "@/lib/grid/types";

export { fmtDay };

export const NETWORK_LABEL: Record<GridNetwork, string> = { instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", mock: "Demo network" };

/** "09:00" → "9:00 AM". */
export function time12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

export const shortDay = (day: string) => fmtDay(day, { month: "short", day: "numeric" });
export const weekday = (day: string) => fmtDay(day, { weekday: "short" });
export const longDay = (day: string) => fmtDay(day, { weekday: "short", month: "short", day: "numeric" });

export type StateIcon = "clock" | "pencil" | "shield" | "alert";

/** The label a planned tile wears: an icon and words, never a colour alone. Live tiles wear nothing. */
export function stateLabel(p: GridPost): { icon: StateIcon; label: string } | null {
  if (!p.localDay) return null;
  switch (p.state) {
    case "scheduled": return { icon: "clock", label: `${weekday(p.localDay)} ${p.localTime ? time12(p.localTime) : ""}`.trim() };
    case "draft": return { icon: "pencil", label: `Draft · ${shortDay(p.localDay)}` };
    case "review": return { icon: "shield", label: `Review · ${shortDay(p.localDay)}` };
    case "failed": return { icon: "alert", label: `Failed · ${shortDay(p.localDay)}` };
    default: return null;
  }
}

export const STATE_WORD: Record<GridPost["state"], string> = { live: "Live", scheduled: "Scheduled", draft: "Draft", review: "In review", failed: "Failed" };

export const FORMAT_WORD: Record<string, string> = { image: "Image", carousel: "Carousel", video: "Video", reel: "Reel", story: "Story", text: "Text", document: "Document" };
