/*
 * Evaluating a trigger: resolve what happened into subjects, test every
 * enabled rule for that workspace, and act on the ones that match.
 *
 * Only matching evaluations become `automation_run` rows. The unique key
 * (rule, triggerRef) is what makes a redelivered job harmless, so recording
 * "did not match (yet)" would permanently block a later re-evaluation.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { automationRule, automationRun, type AutomationRule, type TriggerKind } from "@/db/schema/automations";
import { evaluateConditions, triggerAllows } from "./evaluate";
import { resolveSubjects, type Subject } from "./facts";
import { dispatchRun } from "./apply";

/** Postgres "undefined_table": the automations migration has not been applied yet. */
const notMigrated = (err: unknown) => typeof err === "object" && err !== null && (err as { code?: string }).code === "42P01";

async function enabledRules(workspaceId: string, trigger: TriggerKind): Promise<AutomationRule[]> {
  try {
    return await db.select().from(automationRule).where(and(eq(automationRule.workspaceId, workspaceId), eq(automationRule.trigger, trigger), eq(automationRule.enabled, true))).orderBy(automationRule.createdAt);
  } catch (err) {
    if (notMigrated(err)) return [];
    throw err;
  }
}


/** Insert the run, or null when this (rule, subject) pair already produced one. */
async function claimRun(rule: AutomationRule, subject: Subject, evaluation: ReturnType<typeof evaluateConditions>) {
  const [row] = await db
    .insert(automationRun)
    .values({ organizationId: subject.organizationId, workspaceId: subject.workspaceId, ruleId: rule.id, triggerType: rule.trigger, triggerRefId: subject.refId, status: "matched", evaluation })
    .onConflictDoNothing()
    .returning();
  return row ?? null;
}

export type EvaluateResult = { subjects: number; matched: number; applied: number; parked: number; duplicates: number };

/** Evaluate one trigger event. Safe to call again with the same reference. */
export async function evaluateTrigger(trigger: TriggerKind, refId: string): Promise<EvaluateResult> {
  const result: EvaluateResult = { subjects: 0, matched: 0, applied: 0, parked: 0, duplicates: 0 };
  const subjects = await resolveSubjects(trigger, refId);
  result.subjects = subjects.length;
  const rulesByWorkspace = new Map<string, AutomationRule[]>();

  for (const subject of subjects) {
    let rules = rulesByWorkspace.get(subject.workspaceId);
    if (!rules) {
      rules = await enabledRules(subject.workspaceId, trigger);
      rulesByWorkspace.set(subject.workspaceId, rules);
    }
    for (const rule of rules) {
      if (!triggerAllows(rule, subject)) continue;
      const evaluation = evaluateConditions(rule.conditions, subject.facts);
      if (!evaluation.matched) continue;
      result.matched++;
      const run = await claimRun(rule, subject, evaluation);
      if (!run) {
        result.duplicates++;
        continue;
      }
      const outcome = await dispatchRun(rule, run, subject);
      if ("parked" in outcome) result.parked++;
      else result.applied++;
    }
  }
  return result;
}

/** Dry run: what would this rule have done to the last N subjects? Nothing is written. */
export async function dryRun(rule: AutomationRule, subjects: Subject[]) {
  return subjects.map((subject) => {
    const allowed = triggerAllows(rule, subject);
    const evaluation = evaluateConditions(rule.conditions, subject.facts);
    return {
      refId: subject.refId,
      label: subject.label,
      href: subject.href,
      matched: allowed && evaluation.matched,
      explanation: allowed ? evaluation.explanation : "skipped by the trigger's channel or threshold setting",
    };
  });
}
