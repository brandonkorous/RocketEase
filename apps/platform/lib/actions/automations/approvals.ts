"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { automationApproval } from "@/db/schema/automations";
import { rejectRun } from "@/lib/automations/apply";
import { audit } from "@/lib/audit";
import { emit } from "@/lib/jobs/outbox";
import { workspacePath } from "@/lib/nav";
import { notify } from "@/lib/notifications";
import { requireCapability } from "@/lib/session";
import { fail, guard, type ActionState } from "../content/shared";

/**
 * Clear or refuse an automation's approval gate. Approving resumes the parked
 * run through the worker — the actions have not touched anything yet, and the
 * facts are re-read when it resumes, never replayed from the request.
 */
export async function decideAutomationApproval(workspaceId: string, approvalId: string, decision: "approved" | "rejected", comment?: string): Promise<ActionState> {
  const note = comment?.trim().slice(0, 1000) || null;
  if (decision === "rejected" && !note) return fail("Say why you are rejecting it.");
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "approvals.decide");
    const a = await db.query.automationApproval.findFirst({ where: (x, { and, eq }) => and(eq(x.id, approvalId), eq(x.workspaceId, workspaceId)) });
    if (!a) return fail("That approval no longer exists.");
    if (a.state !== "pending") return fail(`This was already ${a.state}.`);
    if (!a.approverRoles.includes(ctx.workspace.role)) {
      await audit({ action: "authz.deny:approvals.decide", actorUserId: ctx.session.user.id, organizationId: a.organizationId, workspaceId, targetType: "automation_approval", targetId: a.id, result: "denied" });
      return fail("Your role can't decide this automation.");
    }
    const rule = await db.query.automationRule.findFirst({ where: (r, { eq }) => eq(r.id, a.ruleId) });

    if (decision === "rejected") {
      await db.update(automationApproval).set({ state: "rejected", decidedByUserId: ctx.session.user.id, decidedAt: new Date(), comment: note }).where(eq(automationApproval.id, a.id));
      await rejectRun(a.runId, note ?? "rejected by a reviewer");
    } else {
      await db.transaction(async (tx) => {
        await tx.update(automationApproval).set({ state: "approved", decidedByUserId: ctx.session.user.id, decidedAt: new Date(), comment: note }).where(eq(automationApproval.id, a.id));
        await emit(tx, "automation.apply", { runId: a.runId }, { organizationId: a.organizationId, workspaceId, dedupeKey: `automation.apply:${a.runId}` });
      });
    }
    await audit({ action: `automation.${decision}`, actorUserId: ctx.session.user.id, organizationId: a.organizationId, workspaceId, targetType: "automation_run", targetId: a.runId, summary: { note: note ?? undefined, after: { rule: rule?.name, decision } } });
    if (rule?.createdByUserId && rule.createdByUserId !== ctx.session.user.id) {
      await notify({ workspaceId, organizationId: a.organizationId, userId: rule.createdByUserId, kind: "automation.decided", title: `Automation "${rule.name}" ${decision}`, body: note ?? a.summary, href: workspacePath(workspaceId, "settings/automations") });
    }
    revalidatePath(workspacePath(workspaceId, "approvals"));
    revalidatePath(workspacePath(workspaceId, "settings/automations"));
    return { ok: decision === "approved" ? "Approved — the automation is running now." : "Rejected. Nothing was applied." };
  });
}
