"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { workspace } from "@/db/schema/app";
import { audit } from "@/lib/audit";
import { track } from "@/lib/telemetry";
import { requireCapability } from "@/lib/session";
import { fail, guard, type ActionState } from "../content/shared";
import { GOAL_KEYS } from "./catalog";

const schema = z.object({ workspaceId: z.string().min(1), goals: z.array(z.enum(GOAL_KEYS)).max(GOAL_KEYS.length) });

/** Stores onboarding goals in workspace.settings.goals (no schema change). */
export async function setWorkspaceGoals(input: z.input<typeof schema>): Promise<ActionState> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fail("Pick at least one goal.");
  const { workspaceId, goals } = parsed.data;
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "workspace.settings");
    const [ws] = await db.select({ settings: workspace.settings }).from(workspace).where(eq(workspace.id, workspaceId));
    if (!ws) return fail("Workspace not found.");
    const unique = [...new Set(goals)];
    await db.update(workspace).set({ settings: { ...ws.settings, goals: unique, goalsSetAt: new Date().toISOString() }, updatedAt: new Date() }).where(eq(workspace.id, workspaceId));
    await audit({ action: "workspace.settings", actorUserId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId, targetType: "workspace", targetId: workspaceId, summary: { before: { goals: ws.settings.goals ?? [] }, after: { goals: unique } } });
    await track("onboarding_step_completed", { userId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId, surface: "action:setWorkspaceGoals", props: { step: "goals", goals: unique.length } });
    return { ok: "Goals saved." };
  });
}
