/*
 * An automation is never more powerful than the person who created it
 * (permissions.md "Service accounts and automation"). The rule stores its
 * creator; every run re-loads that person's role and grants, so a demotion or
 * removal disables the rule's actions immediately — no rule edit needed.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { workspaceMembership } from "@/db/schema/app";
import type { ActionKind, RuleAction } from "@/db/schema/automations";
import { can, type Capability, type Principal } from "@/lib/authz";
import type { SubjectContext } from "./facts";

/** Capability each action needs. `null` = no extra capability beyond workspace membership. */
export const ACTION_CAPABILITY: Record<ActionKind, Capability | null> = {
  "inbox.assign": "conversations.handle",
  "inbox.assign_round_robin": "conversations.handle",
  "inbox.set_priority": "conversations.handle",
  "inbox.add_tag": "conversations.handle",
  "inbox.saved_reply": "conversations.handle",
  "inbox.snooze": "conversations.handle",
  notify: null,
  "publish.request_approval": "content.edit",
  "publish.retry": "content.publish",
  "campaign.pause_promotion": "campaigns.manage",
  "campaign.pause_ads": "campaigns.manage",
};

export type Creator = { userId: string; principal: Principal };

/** The creator's live membership, or null when they left the workspace. */
export async function loadCreator(workspaceId: string, userId: string | null): Promise<Creator | null> {
  if (!userId) return null;
  const [m] = await db
    .select({ role: workspaceMembership.role, grants: workspaceMembership.grants })
    .from(workspaceMembership)
    .where(and(eq(workspaceMembership.workspaceId, workspaceId), eq(workspaceMembership.userId, userId)));
  if (!m) return null;
  return { userId, principal: { role: m.role, grants: m.grants } };
}

/** Does the creator still hold what this action needs? */
export function creatorMay(creator: Creator | null, action: RuleAction): { ok: boolean; capability: Capability | null; reason?: string } {
  const capability = ACTION_CAPABILITY[action.kind];
  if (!creator) return { ok: false, capability, reason: "the rule's creator is no longer a member of this workspace" };
  if (!capability) return { ok: true, capability };
  if (!can(creator.principal, capability)) return { ok: false, capability, reason: `the rule's creator no longer has ${capability}` };
  return { ok: true, capability };
}

/**
 * Actions that must never run unattended. Sending a public reply is one of
 * them unless the creator can handle conversations AND explicitly chose
 * auto-send — and a review is never auto-answered whatever the rule says.
 */
export function actionNeedsApproval(action: RuleAction, creator: Creator | null, ctx: SubjectContext): { needed: boolean; why?: string } {
  if (action.kind === "campaign.pause_ads") return { needed: true, why: "pausing paid delivery always needs a person" };
  if (action.kind !== "inbox.saved_reply") return { needed: false };
  if (ctx.conversationKind === "review") return { needed: true, why: "public reviews are never answered automatically" };
  if (!action.autoSend) return { needed: true, why: "the rule was not set to send without review" };
  if (!creator || !can(creator.principal, "conversations.handle")) return { needed: true, why: "the rule's creator cannot send replies unattended" };
  return { needed: false };
}

/** Whether the whole run must be parked before anything is applied. */
export function runNeedsApproval(actions: RuleAction[], requiresApproval: boolean, creator: Creator | null, ctx: SubjectContext): { needed: boolean; why: string } {
  if (requiresApproval) return { needed: true, why: "this rule always asks for approval" };
  for (const a of actions) {
    const r = actionNeedsApproval(a, creator, ctx);
    if (r.needed) return { needed: true, why: r.why ?? "an action needs approval" };
  }
  return { needed: false, why: "" };
}
