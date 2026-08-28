"use server";

import { db } from "@/db";
import type { AutomationRule } from "@/db/schema/automations";
import { dryRun } from "@/lib/automations/run";
import { recentSubjects } from "@/lib/automations/samples";
import { requireCapability } from "@/lib/session";
import { fail, guard, type ActionState } from "../content/shared";

export type DryRunHit = { refId: string; label: string; href: string | null; matched: boolean; explanation: string };
export type DryRunResult = ActionState & { hits?: DryRunHit[]; tested?: number; matched?: number };

/**
 * "Test against the last 50 items": evaluates the saved rule against real
 * recent events. Read-only — no run is recorded and no action is applied.
 */
export async function testAutomationRule(workspaceId: string, ruleId: string): Promise<DryRunResult> {
  return guard(async () => {
    await requireCapability(workspaceId, "workspace.settings");
    let rule: AutomationRule | undefined;
    try {
      rule = await db.query.automationRule.findFirst({ where: (r, { and, eq }) => and(eq(r.id, ruleId), eq(r.workspaceId, workspaceId)) });
    } catch {
      return fail("Automations are not available yet in this workspace.");
    }
    if (!rule) return fail("That rule no longer exists.");
    const subjects = await recentSubjects(rule.trigger, workspaceId);
    if (!subjects.length) return { ok: "Nothing to test against yet — this workspace has no matching history.", hits: [], tested: 0, matched: 0 };
    const hits = await dryRun(rule, subjects);
    const matched = hits.filter((h) => h.matched).length;
    return { ok: `${matched} of ${hits.length} recent items would have matched.`, hits, tested: hits.length, matched };
  });
}
