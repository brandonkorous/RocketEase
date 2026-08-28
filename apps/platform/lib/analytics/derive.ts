import type { Totals } from "./queries";

/** Engagement total: provider total when present, else the sum of its parts. Plain module (safe for client components). */
export const engagementOf = (t: Totals) => t.engagement ?? (t.reactions != null || t.comments != null || t.shares != null || t.saves != null ? (t.reactions ?? 0) + (t.comments ?? 0) + (t.shares ?? 0) + (t.saves ?? 0) : undefined);
