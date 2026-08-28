/*
 * Action dispatch. Every action re-checks the rule creator's capabilities
 * before it runs, so a rule written by a manager stops acting the moment that
 * manager is demoted (permissions.md "Service accounts and automation").
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { workspaceMembership, type WorkspaceRole } from "@/db/schema/app";
import type { ActionOutcome, RuleAction } from "@/db/schema/automations";
import { notify } from "@/lib/notifications";
import { creatorMay } from "../capabilities";
import { describeAction } from "../labels";
import { applyAdsAction } from "./ads";
import { applyInboxAction } from "./inbox";
import { applyPublishAction } from "./publish";
import type { ApplyContext } from "./types";

export type { ApplyContext } from "./types";

async function usersWithRoles(workspaceId: string, roles: WorkspaceRole[]) {
  if (!roles.length) return [];
  const rows = await db.select({ userId: workspaceMembership.userId }).from(workspaceMembership).where(and(eq(workspaceMembership.workspaceId, workspaceId), inArray(workspaceMembership.role, roles)));
  return rows.map((r) => r.userId);
}

/** Notification names its rule and the event that triggered it. */
async function applyNotify(c: ApplyContext, a: Extract<RuleAction, { kind: "notify" }>): Promise<ActionOutcome> {
  const { workspaceId, organizationId, label, href } = c.subject;
  const explicit = a.userIds ?? [];
  const byRole = await usersWithRoles(workspaceId, a.roles ?? []);
  const recipients = [...new Set([...explicit, ...byRole])];
  const body = a.message?.trim() || label;
  const targets: (string | null)[] = recipients.length ? recipients : [null];
  for (const userId of targets) {
    await notify({ workspaceId, organizationId, userId, kind: "automation.triggered", title: `Automation "${c.rule.name}" ran`, body, href: href ?? undefined });
  }
  return { kind: "notify", status: "applied", detail: recipients.length ? `notified ${recipients.length} person(s)` : "notified workspace managers" };
}

/** Run one action, guarded by the creator's live capabilities. */
export async function applyAction(c: ApplyContext, a: RuleAction): Promise<ActionOutcome> {
  const gate = creatorMay(c.creator, a);
  if (!gate.ok) return { kind: a.kind, status: "skipped", detail: gate.reason ?? "not permitted" };
  try {
    if (a.kind === "notify") return await applyNotify(c, a);
    if (a.kind.startsWith("inbox.")) return await applyInboxAction(c, a);
    if (a.kind.startsWith("publish.")) return await applyPublishAction(c, a);
    if (a.kind.startsWith("campaign.")) return await applyAdsAction(c, a);
    return { kind: a.kind, status: "skipped", detail: "unknown action" };
  } catch (err) {
    return { kind: a.kind, status: "failed", detail: err instanceof Error ? err.message : String(err) };
  }
}

/** Run every action in order; one failure does not stop the rest. */
export async function applyActions(c: ApplyContext, actions: RuleAction[]): Promise<ActionOutcome[]> {
  const out: ActionOutcome[] = [];
  for (const a of actions) out.push(await applyAction(c, a));
  return out;
}

export { describeAction };
