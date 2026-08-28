/*
 * Human wording for triggers and actions. Shared by the builder, the run
 * history and the approval summary so a rule reads the same everywhere.
 * Pure: no db, safe in client components.
 */
import type { ActionKind, RuleAction, RunStatus, TriggerKind } from "@/db/schema/automations";

export const TRIGGER_LABEL: Record<TriggerKind, string> = {
  "inbox.message_received": "A message arrives in the inbox",
  "post.published": "A post publishes successfully",
  "post.failed": "A post fails to publish",
  "approval.decided": "An approval is decided",
  "campaign.budget_threshold": "Campaign spend reaches a share of budget",
};

/** Order the builder offers triggers in. Client-safe: avoids importing the schema module. */
export const TRIGGER_ORDER: TriggerKind[] = ["inbox.message_received", "post.published", "post.failed", "approval.decided", "campaign.budget_threshold"];

export const TRIGGER_HINT: Record<TriggerKind, string> = {
  "inbox.message_received": "Runs once per new inbound comment, mention, message or review.",
  "post.published": "Runs once per channel a post reaches.",
  "post.failed": "Runs when a channel gives up on a post, after reconciliation.",
  "approval.decided": "Runs when a reviewer approves, rejects or asks for changes.",
  "campaign.budget_threshold": "Checked after every paid import and nightly. Runs once per campaign.",
};

export const ACTION_LABEL: Record<ActionKind, string> = {
  "inbox.assign": "Assign to a person",
  "inbox.assign_round_robin": "Assign round-robin within a role",
  "inbox.set_priority": "Set priority",
  "inbox.add_tag": "Add a contact tag",
  "inbox.saved_reply": "Send a saved reply",
  "inbox.snooze": "Snooze the conversation",
  notify: "Notify people",
  "publish.request_approval": "Ask for approval on the next version",
  "publish.retry": "Retry publishing with backoff",
  "campaign.pause_promotion": "Pause the ads promoting this post",
  "campaign.pause_ads": "Pause this campaign's ads",
};

/** Which actions make sense for which trigger; the builder only offers these. */
export const ACTIONS_FOR_TRIGGER: Record<TriggerKind, ActionKind[]> = {
  "inbox.message_received": ["inbox.assign", "inbox.assign_round_robin", "inbox.set_priority", "inbox.add_tag", "inbox.saved_reply", "inbox.snooze", "notify"],
  "post.published": ["notify", "campaign.pause_promotion"],
  "post.failed": ["notify", "publish.retry", "publish.request_approval", "campaign.pause_promotion"],
  "approval.decided": ["notify", "publish.request_approval"],
  "campaign.budget_threshold": ["notify", "campaign.pause_ads"],
};

export const STATUS_LABEL: Record<RunStatus, string> = {
  matched: "Matched",
  skipped: "Skipped",
  awaiting_approval: "Waiting for approval",
  applied: "Applied",
  failed: "Failed",
  rejected: "Rejected",
};

export const STATUS_COLOR: Record<RunStatus, "success" | "warning" | "error" | "neutral" | "info"> = {
  matched: "neutral",
  skipped: "neutral",
  awaiting_approval: "warning",
  applied: "success",
  failed: "error",
  rejected: "error",
};

export type NameLookup = { users?: Record<string, string>; savedReplies?: Record<string, string> };

/** One action in plain words, e.g. "Assign to Dana Lopez" or "Send saved reply "Refund policy" (needs approval)". */
export function describeAction(a: RuleAction, names: NameLookup = {}): string {
  const who = (id: string) => names.users?.[id] ?? "a teammate";
  switch (a.kind) {
    case "inbox.assign":
      return `Assign to ${who(a.userId)}`;
    case "inbox.assign_round_robin":
      return `Assign round-robin among ${a.role.replace("_", " ")}s`;
    case "inbox.set_priority":
      return `Set priority to ${a.priority}`;
    case "inbox.add_tag":
      return `Tag the contact "${a.tag}"`;
    case "inbox.saved_reply":
      return `Send saved reply "${names.savedReplies?.[a.savedReplyId] ?? "…"}"${a.autoSend ? "" : " after approval"}`;
    case "inbox.snooze":
      return `Snooze for ${a.hours} hour${a.hours === 1 ? "" : "s"}`;
    case "notify": {
      const targets = [...(a.userIds ?? []).map(who), ...(a.roles ?? []).map((r) => `${r.replace("_", " ")}s`)];
      return `Notify ${targets.length ? targets.join(", ") : "workspace managers"}`;
    }
    case "publish.request_approval":
      return `Ask ${a.assigneeUserId ? who(a.assigneeUserId) : "an approver"} to review the next version`;
    case "publish.retry":
      return `Retry publishing${a.delayMinutes ? ` in ${a.delayMinutes} minutes` : " with backoff"}`;
    case "campaign.pause_promotion":
      return "Pause the ads promoting this post";
    case "campaign.pause_ads":
      return "Pause this campaign's ads";
    default:
      return "Unknown action";
  }
}

export const describeActions = (actions: RuleAction[], names: NameLookup = {}) => actions.map((a) => describeAction(a, names)).join("; ");
