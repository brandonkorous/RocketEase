/*
 * The closed list of notification kinds. `notify()` only accepts a kind from
 * here, so an emitter cannot invent one the center cannot label. Each kind
 * belongs to one PREFERENCE (what a member switches on or off) and to the
 * tabs that list it. Locks are safety: a failed publish always reaches the
 * app, because a quiet failure is the worst outcome this product can have.
 */

export type NotificationKind =
  | "publish.failed"
  | "connection.health"
  | "approval.requested"
  | "approval.overdue"
  | "automation.approval_requested"
  | "approval.decided"
  | "automation.decided"
  | "comment.added"
  | "inbox.assigned"
  | "inbox.reply_failed"
  | "promotion.created"
  | "promotion.failed"
  | "report.ready"
  | "automation.triggered"
  | "rights.expiring";

export type PrefKey = "publish" | "connection" | "approval_requests" | "approval_decisions" | "comments" | "inbox_assignments" | "reply_failures" | "promotions" | "reports" | "automations" | "rights";
export type TabKey = "all" | "unread" | "action" | "approvals" | "comments" | "system";
export type Tone = "neutral" | "error";
export type IconKey = "send" | "plug" | "shield" | "check" | "comment" | "inbox" | "alert" | "megaphone" | "file" | "bolt" | "clock";

export type KindSpec = {
  kind: NotificationKind;
  pref: PrefKey;
  icon: IconKey;
  /** Status chip: icon + label, never colour alone. */
  chip: { icon: IconKey; label: string; tone: Tone };
  /** What the row's link is called; a needs-action kind gets a button, the rest a quiet link. */
  action: string;
  needsAction: boolean;
  tabs: Exclude<TabKey, "all" | "unread">[];
};

export const KINDS: KindSpec[] = [
  { kind: "publish.failed", pref: "publish", icon: "send", chip: { icon: "alert", label: "Failed", tone: "error" }, action: "Fix post", needsAction: true, tabs: ["action"] },
  { kind: "connection.health", pref: "connection", icon: "plug", chip: { icon: "alert", label: "Reconnect", tone: "error" }, action: "Reconnect", needsAction: true, tabs: ["action", "system"] },
  { kind: "approval.requested", pref: "approval_requests", icon: "shield", chip: { icon: "clock", label: "Needs review", tone: "neutral" }, action: "Review", needsAction: true, tabs: ["action", "approvals"] },
  // The one reminder a request gets, the first time a sweep finds it past due (lib/approvals/due.ts).
  { kind: "approval.overdue", pref: "approval_requests", icon: "shield", chip: { icon: "alert", label: "Overdue", tone: "error" }, action: "Review", needsAction: true, tabs: ["action", "approvals"] },
  { kind: "automation.approval_requested", pref: "approval_requests", icon: "shield", chip: { icon: "clock", label: "Needs review", tone: "neutral" }, action: "Review", needsAction: true, tabs: ["action", "approvals"] },
  { kind: "approval.decided", pref: "approval_decisions", icon: "shield", chip: { icon: "check", label: "Decided", tone: "neutral" }, action: "Open post", needsAction: false, tabs: ["approvals"] },
  { kind: "automation.decided", pref: "automations", icon: "bolt", chip: { icon: "check", label: "Decided", tone: "neutral" }, action: "Open automation", needsAction: false, tabs: ["approvals", "system"] },
  { kind: "comment.added", pref: "comments", icon: "comment", chip: { icon: "comment", label: "Comment", tone: "neutral" }, action: "Open post", needsAction: false, tabs: ["comments"] },
  { kind: "inbox.assigned", pref: "inbox_assignments", icon: "inbox", chip: { icon: "inbox", label: "Assigned to you", tone: "neutral" }, action: "Open conversation", needsAction: false, tabs: ["comments"] },
  { kind: "inbox.reply_failed", pref: "reply_failures", icon: "inbox", chip: { icon: "alert", label: "Failed", tone: "error" }, action: "Open conversation", needsAction: true, tabs: ["action", "comments"] },
  { kind: "promotion.created", pref: "promotions", icon: "megaphone", chip: { icon: "check", label: "Created", tone: "neutral" }, action: "Open campaign", needsAction: false, tabs: ["system"] },
  { kind: "promotion.failed", pref: "promotions", icon: "megaphone", chip: { icon: "alert", label: "Failed", tone: "error" }, action: "Open campaign", needsAction: true, tabs: ["action", "system"] },
  { kind: "report.ready", pref: "reports", icon: "file", chip: { icon: "check", label: "Ready", tone: "neutral" }, action: "Open report", needsAction: false, tabs: ["system"] },
  { kind: "automation.triggered", pref: "automations", icon: "bolt", chip: { icon: "check", label: "Ran", tone: "neutral" }, action: "Open automation", needsAction: false, tabs: ["system"] },
  { kind: "rights.expiring", pref: "rights", icon: "clock", chip: { icon: "clock", label: "Expiring", tone: "neutral" }, action: "Open rights", needsAction: true, tabs: ["action", "system"] },
];

export const KIND_KEYS = KINDS.map((k) => k.kind) as [NotificationKind, ...NotificationKind[]];
export const specFor = (kind: string): KindSpec | undefined => KINDS.find((k) => k.kind === kind);

export type PrefSpec = {
  key: PrefKey;
  group: string;
  label: string;
  desc: string;
  icon: IconKey;
  defaults: { inApp: boolean; email: boolean };
  /** A locked channel cannot be switched off; the UI says "Always". */
  lock?: { inApp?: boolean; email?: boolean };
};

/** Settings → Notifications rows, in display order. Email defaults follow onboarding.md (failures, approvals, rights). */
export const PREFS: PrefSpec[] = [
  { key: "publish", group: "Publishing", label: "Publishing failures", desc: "A post failed or only partly published. Always shown here, so nothing fails quietly.", icon: "send", defaults: { inApp: true, email: true }, lock: { inApp: true } },
  { key: "connection", group: "Publishing", label: "Connection health", desc: "A connected account needs to be reconnected or lost a permission.", icon: "plug", defaults: { inApp: true, email: true } },
  { key: "approval_requests", group: "Approvals", label: "Approval requests", desc: "Someone asked you to review a post or an automation, or a review you owe is overdue.", icon: "shield", defaults: { inApp: true, email: true } },
  { key: "approval_decisions", group: "Approvals", label: "Approval decisions", desc: "A post you submitted was approved or sent back.", icon: "check", defaults: { inApp: true, email: false } },
  { key: "comments", group: "Comments and inbox", label: "Comments", desc: "A teammate commented on a post you are part of.", icon: "comment", defaults: { inApp: true, email: false } },
  { key: "inbox_assignments", group: "Comments and inbox", label: "Inbox assignments", desc: "A conversation was assigned to you.", icon: "inbox", defaults: { inApp: true, email: false } },
  { key: "reply_failures", group: "Comments and inbox", label: "Reply failures", desc: "A reply you sent could not be delivered.", icon: "alert", defaults: { inApp: true, email: false } },
  { key: "promotions", group: "Campaigns, reports and automations", label: "Promotions", desc: "A promotion you confirmed was created, or could not be.", icon: "megaphone", defaults: { inApp: true, email: false } },
  { key: "reports", group: "Campaigns, reports and automations", label: "Reports ready", desc: "A report you requested finished generating.", icon: "file", defaults: { inApp: true, email: false } },
  { key: "automations", group: "Campaigns, reports and automations", label: "Automations", desc: "A rule ran, or a rule you own was approved or declined.", icon: "bolt", defaults: { inApp: true, email: false } },
  { key: "rights", group: "Rights", label: "Rights expiring", desc: "A licence or consent runs out under a scheduled or promoted post.", icon: "clock", defaults: { inApp: true, email: true } },
];
export const PREF_KEYS = PREFS.map((p) => p.key) as [PrefKey, ...PrefKey[]];

export type ChannelChoice = { inApp?: boolean; email?: boolean };
/** Stored shape. A bare boolean is the pre-M14.2 form: email opt-in keyed by KIND. */
export type StoredPrefs = Record<string, boolean | ChannelChoice>;
export type EffectivePrefs = Record<PrefKey, { inApp: boolean; email: boolean }>;

/** Effective choices for every preference: stored value, else the default; locks always win. */
export function readPrefs(stored: StoredPrefs): EffectivePrefs {
  const out = {} as EffectivePrefs;
  for (const p of PREFS) out[p.key] = { ...p.defaults };
  for (const [key, value] of Object.entries(stored)) {
    const pref = (PREF_KEYS as readonly string[]).includes(key) ? (key as PrefKey) : specFor(key)?.pref;
    if (!pref) continue;
    if (typeof value === "boolean") out[pref].email = value;
    else {
      if (typeof value.inApp === "boolean") out[pref].inApp = value.inApp;
      if (typeof value.email === "boolean") out[pref].email = value.email;
    }
  }
  for (const p of PREFS) {
    if (p.lock?.inApp) out[p.key].inApp = true;
    if (p.lock?.email) out[p.key].email = true;
  }
  return out;
}

const prefOf = (kind: NotificationKind) => specFor(kind)?.pref;

export function inAppWanted(stored: StoredPrefs, kind: NotificationKind): boolean {
  const pref = prefOf(kind);
  return pref ? readPrefs(stored)[pref].inApp : true;
}

/** Email opt-in for a kind; `fallback` is the emitter's own default for a kind with no preference row. */
export function emailWanted(stored: StoredPrefs, kind: NotificationKind, fallback: boolean): boolean {
  const pref = prefOf(kind);
  return pref ? readPrefs(stored)[pref].email : fallback;
}

export const TABS: { key: TabKey; label: string; definition: string }[] = [
  { key: "all", label: "All", definition: "Every notification sent to you in this workspace." },
  { key: "unread", label: "Unread", definition: "Notifications you have not opened yet." },
  { key: "action", label: "Needs action", definition: "Kinds that stay wrong until someone acts: a failed publish or reply, a review request, a broken connection, expiring rights." },
  { key: "approvals", label: "Approvals", definition: "Review requests and decisions on posts and automations." },
  { key: "comments", label: "Comments", definition: "Comments on your posts, inbox assignments, and replies that failed to send." },
  { key: "system", label: "System", definition: "Reports, automations, promotions, rights, and connection health." },
];

/** The kinds a tab lists; `undefined` means no kind filter (All, Unread). */
export function kindsForTab(tab: TabKey): NotificationKind[] | undefined {
  if (tab === "all" || tab === "unread") return undefined;
  return KINDS.filter((k) => k.tabs.includes(tab)).map((k) => k.kind);
}
