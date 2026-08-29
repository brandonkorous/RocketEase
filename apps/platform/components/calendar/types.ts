import type { ReceiptChip } from "@/lib/publishing/receipt";

export type CalendarPost = { variantId: string; itemId: string; title: string; text: string; status: string; itemStatus: string; approval: string; channelId: string; channelName: string; network: string; scheduledAt: string | null; localDay: string | null; localTime: string | null; thumbUrl: string | null; format: string; error: string | null; recycled: boolean; receipt: ReceiptChip };
export type CalendarData = {
  workspaceId: string; timezone: string; today: string; anchor: string; view: "week" | "month" | "list"; rangeStart: string; rangeEnd: string;
  posts: CalendarPost[]; unscheduled: { itemId: string; title: string; status: string; text: string; updatedAt: string }[];
  channels: { id: string; name: string; network: string }[];
  stats: { scheduled: number; drafts: number; underReview: number; needsChanges: number; published: number; failed: number };
  canPublish: boolean; canCreate: boolean; filters: { status: string; channel: string };
};
export type Nav = (patch: Record<string, string | null>) => void;

export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const fmtDay = (iso: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...opts }).format(new Date(`${iso}T00:00:00Z`));
export const hourLabel = (h: number) => (h === 0 ? "12 AM" : h > 12 ? `${h - 12} PM` : h === 12 ? "12 PM" : `${h} AM`);
