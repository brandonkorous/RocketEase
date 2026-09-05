/* Plain constants shared by settings actions and UI (kept out of "use server" modules). */

/** onboarding.md step 4: publish, engage, report, promote, collaborate. */
export const GOALS = [
  { key: "publish", label: "Plan and publish", desc: "Schedule content across channels from one calendar." },
  { key: "engage", label: "Engage", desc: "Answer comments, messages, and mentions from a shared inbox." },
  { key: "report", label: "Report", desc: "Measure what works and share reports." },
  { key: "promote", label: "Promote", desc: "Run paid promotion next to organic campaigns." },
  { key: "collaborate", label: "Collaborate", desc: "Review, approve, and hand off work across a team or clients." },
] as const;
export type GoalKey = (typeof GOALS)[number]["key"];
export const GOAL_KEYS = GOALS.map((g) => g.key) as [GoalKey, ...GoalKey[]];

/** Reads goals from workspace.settings; tolerant of older shapes. */
export function readGoals(settings: Record<string, unknown>): GoalKey[] {
  const raw = Array.isArray(settings.goals) ? settings.goals : [];
  return raw.filter((g): g is GoalKey => typeof g === "string" && (GOAL_KEYS as readonly string[]).includes(g));
}

export type TrackingSettings = { utmSource: string; utmMedium: string; utmCampaign: string };
export const DEFAULT_TRACKING: TrackingSettings = { utmSource: "", utmMedium: "social", utmCampaign: "" };

export function readTracking(settings: Record<string, unknown>): TrackingSettings {
  const t = (settings.tracking ?? {}) as Partial<TrackingSettings>;
  return { ...DEFAULT_TRACKING, ...Object.fromEntries(Object.entries(t).filter(([, v]) => typeof v === "string")) };
}

export type RecyclingSettings = { autoSchedule: boolean };

/**
 * Evergreen recycling defaults to a human gate: a recycled copy is a draft
 * until someone schedules it. Turning this on lets the worker schedule
 * directly, but only when the rule's author still holds `content.publish`.
 */
export function readRecycling(settings: Record<string, unknown>): RecyclingSettings {
  const r = (settings.recycling ?? {}) as Partial<RecyclingSettings>;
  return { autoSchedule: r.autoSchedule === true };
}

/* Notification kinds and preferences live in lib/notifications/catalog.ts. */

export const INDUSTRIES = ["Agency", "Health & Fitness", "Retail & E-commerce", "Food & Beverage", "Beauty & Fashion", "Technology & SaaS", "Media & Entertainment", "Education", "Finance", "Travel & Hospitality", "Nonprofit", "Other"] as const;
