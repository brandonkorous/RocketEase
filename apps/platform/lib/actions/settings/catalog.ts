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

export type TrackingSettings = { utmSource: string; utmMedium: string; utmCampaign: string; pixelId: string };
export const DEFAULT_TRACKING: TrackingSettings = { utmSource: "", utmMedium: "social", utmCampaign: "", pixelId: "" };

export function readTracking(settings: Record<string, unknown>): TrackingSettings {
  const t = (settings.tracking ?? {}) as Partial<TrackingSettings>;
  return { ...DEFAULT_TRACKING, ...Object.fromEntries(Object.entries(t).filter(([, v]) => typeof v === "string")) };
}

/** Every kind `notify()` emits, with its default email behaviour (onboarding.md reserves email for failures, approvals, security). */
export const NOTIFICATION_KINDS = [
  { kind: "publish.failed", label: "Publishing failures", desc: "A post failed or only partly published.", email: true },
  { kind: "approval.requested", label: "Approval requests", desc: "Someone asked you to review a post.", email: true },
  { kind: "approval.decided", label: "Approval decisions", desc: "A post you submitted was approved or sent back.", email: true },
  { kind: "comment.added", label: "Comments", desc: "A teammate commented on a post you are part of.", email: false },
  { kind: "inbox.assigned", label: "Inbox assignments", desc: "A conversation was assigned to you.", email: false },
  { kind: "inbox.reply_failed", label: "Reply failures", desc: "A reply you sent could not be delivered.", email: false },
  { kind: "report.ready", label: "Reports ready", desc: "A report you requested finished generating.", email: false },
] as const;
export const NOTIFICATION_KIND_KEYS = NOTIFICATION_KINDS.map((k) => k.kind) as [string, ...string[]];

/** Effective email opt-in for a kind: the member's choice, else the kind's default, else the caller's flag. */
export function emailWanted(prefs: Record<string, boolean>, kind: string, fallback: boolean) {
  if (kind in prefs) return prefs[kind];
  return NOTIFICATION_KINDS.find((k) => k.kind === kind)?.email ?? fallback;
}
