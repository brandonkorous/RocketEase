"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { workspace } from "@/db/schema/app";
import { recycleRule } from "@/db/schema/recycling";
import { audit } from "@/lib/audit";
import { emit } from "@/lib/jobs/outbox";
import { requireCapability } from "@/lib/session";
import { fail, guard, type ActionState } from "./content/shared";

const ruleSchema = z.object({
  workspaceId: z.string().min(1),
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1, "Name the rule").max(80),
  enabled: z.boolean().default(true),
  tagIds: z.array(z.string()).max(20).default([]),
  channelIds: z.array(z.string()).max(20).default([]),
  everyDays: z.number().int().min(1, "Wait at least a day between reuses").max(365),
  atTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a 24-hour time like 09:00"),
  maxRepeatsPerItem: z.number().int().min(1).max(50),
  /** "YYYY-MM-DD" in the workspace timezone, or empty to clear the pause. */
  pauseUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).default(""),
});
export type RecycleRuleInput = z.input<typeof ruleSchema>;

export async function saveRecycleRule(input: RecycleRuleInput): Promise<ActionState & { id?: string }> {
  const parsed = ruleSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid rule");
  const { workspaceId, id, pauseUntil, ...rest } = parsed.data;
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "content.create");
    const org = ctx.workspace.organizationId;
    const values = { ...rest, pauseUntil: pauseUntil ? new Date(`${pauseUntil}T00:00:00Z`) : null, updatedAt: new Date() };
    if (id) {
      const [row] = await db.update(recycleRule).set(values).where(and(eq(recycleRule.id, id), eq(recycleRule.workspaceId, workspaceId))).returning({ id: recycleRule.id });
      if (!row) return fail("Recycling rule not found.");
      await audit({ action: "content.recycle_rule_update", actorUserId: ctx.session.user.id, organizationId: org, workspaceId, targetType: "recycle_rule", targetId: row.id, summary: { after: values } });
      return { ok: "Recycling rule saved.", id: row.id };
    }
    const [row] = await db.insert(recycleRule).values({ organizationId: org, workspaceId, ...values, createdByUserId: ctx.session.user.id }).returning({ id: recycleRule.id });
    await audit({ action: "content.recycle_rule_create", actorUserId: ctx.session.user.id, organizationId: org, workspaceId, targetType: "recycle_rule", targetId: row.id, summary: { after: values } });
    return { ok: "Recycling rule created.", id: row.id };
  });
}

export async function setRecycleRuleEnabled(workspaceId: string, id: string, enabled: boolean): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "content.create");
    const [row] = await db.update(recycleRule).set({ enabled, updatedAt: new Date() }).where(and(eq(recycleRule.id, id), eq(recycleRule.workspaceId, workspaceId))).returning({ id: recycleRule.id, name: recycleRule.name });
    if (!row) return fail("Recycling rule not found.");
    await audit({ action: enabled ? "content.recycle_rule_enable" : "content.recycle_rule_disable", actorUserId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId, targetType: "recycle_rule", targetId: row.id });
    return { ok: enabled ? `"${row.name}" is on.` : `"${row.name}" is off.` };
  });
}

export async function deleteRecycleRule(workspaceId: string, id: string): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "content.edit");
    const [row] = await db.delete(recycleRule).where(and(eq(recycleRule.id, id), eq(recycleRule.workspaceId, workspaceId))).returning({ id: recycleRule.id, name: recycleRule.name });
    if (!row) return fail("Recycling rule not found.");
    await audit({ action: "content.recycle_rule_delete", actorUserId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId, targetType: "recycle_rule", targetId: row.id, summary: { before: { name: row.name } } });
    return { ok: "Recycling rule deleted. Drafts it already made stay." };
  });
}

/** Run a rule's slot now instead of waiting for the hourly tick. Idempotent per slot. */
export async function runRecycleRuleNow(workspaceId: string, id: string): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "content.create");
    const rule = await db.query.recycleRule.findFirst({ where: (r, { and, eq }) => and(eq(r.id, id), eq(r.workspaceId, workspaceId)) });
    if (!rule) return fail("Recycling rule not found.");
    await emit(db, "recycle.tick", { workspaceId, ruleId: id }, { organizationId: ctx.workspace.organizationId, workspaceId, dedupeKey: `recycle:${id}:manual` });
    await audit({ action: "content.recycle_rule_run", actorUserId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId, targetType: "recycle_rule", targetId: id });
    return { ok: "Queued. The result appears under Recent runs." };
  });
}

/** Workspace-wide switch: recycled copies are drafts unless this is on. */
export async function setRecycleAutoSchedule(workspaceId: string, autoSchedule: boolean): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "workspace.settings");
    const [ws] = await db.select({ settings: workspace.settings }).from(workspace).where(eq(workspace.id, workspaceId));
    const settings = { ...(ws?.settings ?? {}), recycling: { autoSchedule } };
    await db.update(workspace).set({ settings, updatedAt: new Date() }).where(eq(workspace.id, workspaceId));
    await audit({ action: "workspace.settings_update", actorUserId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId, targetType: "workspace", targetId: workspaceId, summary: { after: { recycling: { autoSchedule } } } });
    return { ok: autoSchedule ? "Recycled posts will be scheduled automatically." : "Recycled posts will wait as drafts." };
  });
}
