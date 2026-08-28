"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { WORKSPACE_ROLES } from "@/db/schema/app";
import { ACTION_KINDS, OPERATORS, TRIGGERS, automationRule } from "@/db/schema/automations";
import { ACTION_CAPABILITY } from "@/lib/automations/capabilities";
import { ACTIONS_FOR_TRIGGER } from "@/lib/automations/labels";
import { audit } from "@/lib/audit";
import { workspacePath } from "@/lib/nav";
import { hasCapability, requireCapability } from "@/lib/session";
import { fail, guard, type ActionState } from "../content/shared";

const role = z.enum(WORKSPACE_ROLES);
const condition = z.object({ field: z.string().min(1).max(60), op: z.enum(OPERATORS), value: z.string().max(300) });
const conditions = z.object({ match: z.enum(["all", "any"]), conditions: z.array(condition).max(12) });
const action = z.object({ kind: z.enum(ACTION_KINDS) }).catchall(z.unknown());

const schema = z.object({
  workspaceId: z.string().min(1),
  id: z.string().optional(),
  name: z.string().trim().min(1, "Give the rule a name.").max(80),
  description: z.string().trim().max(300).optional(),
  enabled: z.boolean().optional(),
  trigger: z.enum(TRIGGERS),
  triggerConfig: z.object({ thresholdPercent: z.coerce.number().min(1).max(1000).optional(), channelIds: z.array(z.string()).max(50).optional() }).optional(),
  conditions,
  actions: z.array(action).min(1, "Add at least one action.").max(8),
  requiresApproval: z.boolean().optional(),
  approverRoles: z.array(role).min(1).max(8).optional(),
});

export type AutomationRuleInput = z.input<typeof schema>;

/** A rule may never do something its author cannot do by hand (permissions.md). */
function capabilityProblem(trigger: (typeof TRIGGERS)[number], actions: { kind: (typeof ACTION_KINDS)[number] }[], ws: Parameters<typeof hasCapability>[0]): string | null {
  const allowed = ACTIONS_FOR_TRIGGER[trigger];
  for (const a of actions) {
    if (!allowed.includes(a.kind)) return `"${a.kind}" does not apply to this trigger.`;
    const cap = ACTION_CAPABILITY[a.kind];
    if (cap && !hasCapability(ws, cap)) return `You need the ${cap} permission to add "${a.kind}" to a rule.`;
  }
  return null;
}

/**
 * Create or update a rule. The saver becomes the rule's acting identity, so the
 * capability check above is also the ceiling the worker enforces at run time.
 */
export async function saveAutomationRule(input: AutomationRuleInput): Promise<ActionState & { id?: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the rule and try again.");
  const d = parsed.data;
  return guard(async () => {
    const ctx = await requireCapability(d.workspaceId, "workspace.settings");
    const problem = capabilityProblem(d.trigger, d.actions, ctx.workspace);
    if (problem) return fail(problem);
    const values = {
      organizationId: ctx.workspace.organizationId,
      workspaceId: d.workspaceId,
      name: d.name,
      description: d.description ?? "",
      enabled: d.enabled ?? true,
      trigger: d.trigger,
      triggerConfig: d.triggerConfig ?? {},
      conditions: d.conditions,
      actions: d.actions as never,
      requiresApproval: d.requiresApproval ?? false,
      approverRoles: d.approverRoles ?? (["owner", "admin", "manager"] as const),
      createdByUserId: ctx.session.user.id,
      updatedAt: new Date(),
    };
    const existing = d.id ? await db.query.automationRule.findFirst({ where: (r, { and, eq }) => and(eq(r.id, d.id!), eq(r.workspaceId, d.workspaceId)) }) : null;
    if (d.id && !existing) return fail("That rule no longer exists.");
    const id = existing
      ? (await db.update(automationRule).set(values).where(eq(automationRule.id, existing.id)).returning({ id: automationRule.id }))[0].id
      : (await db.insert(automationRule).values(values).returning({ id: automationRule.id }))[0].id;
    await audit({ action: existing ? "automation.update" : "automation.create", actorUserId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId: d.workspaceId, targetType: "automation_rule", targetId: id, summary: { before: existing ? { name: existing.name, enabled: existing.enabled, actions: existing.actions } : undefined, after: { name: d.name, trigger: d.trigger, actions: d.actions, requiresApproval: values.requiresApproval } } });
    revalidatePath(workspacePath(d.workspaceId, "settings/automations"));
    return { ok: existing ? "Rule saved." : "Rule created.", id };
  });
}

/** Kill switch: disabling stops the rule immediately, without deleting its history. */
export async function setAutomationEnabled(workspaceId: string, ruleId: string, enabled: boolean): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "workspace.settings");
    const rule = await db.query.automationRule.findFirst({ where: (r, { and, eq }) => and(eq(r.id, ruleId), eq(r.workspaceId, workspaceId)) });
    if (!rule) return fail("That rule no longer exists.");
    await db.update(automationRule).set({ enabled, updatedAt: new Date() }).where(and(eq(automationRule.id, ruleId), eq(automationRule.workspaceId, workspaceId)));
    await audit({ action: enabled ? "automation.enable" : "automation.disable", actorUserId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId, targetType: "automation_rule", targetId: ruleId, summary: { before: { enabled: rule.enabled }, after: { enabled } } });
    revalidatePath(workspacePath(workspaceId, "settings/automations"));
    return { ok: enabled ? `"${rule.name}" is on.` : `"${rule.name}" is off. Nothing it would have done will run.` };
  });
}

export async function deleteAutomationRule(workspaceId: string, ruleId: string): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "workspace.settings");
    const rule = await db.query.automationRule.findFirst({ where: (r, { and, eq }) => and(eq(r.id, ruleId), eq(r.workspaceId, workspaceId)) });
    if (!rule) return fail("That rule no longer exists.");
    await db.delete(automationRule).where(and(eq(automationRule.id, ruleId), eq(automationRule.workspaceId, workspaceId)));
    await audit({ action: "automation.delete", actorUserId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId, targetType: "automation_rule", targetId: ruleId, summary: { before: { name: rule.name, trigger: rule.trigger, actions: rule.actions } } });
    revalidatePath(workspacePath(workspaceId, "settings/automations"));
    return { ok: `"${rule.name}" deleted, along with its run history.` };
  });
}
