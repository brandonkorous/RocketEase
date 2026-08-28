/*
 * Pure condition evaluation for automation rules. No I/O, no db — the worker
 * gathers facts (lib/automations/facts.ts) and hands them here, and the dry-run
 * in Settings uses exactly the same function so the preview cannot drift.
 */
import type { Condition, ConditionGroup, ConditionResult, Operator, RunEvaluation, TriggerConfig, TriggerKind } from "@/db/schema/automations";

export type FactValue = string | number | boolean | string[] | null | undefined;
export type Facts = Record<string, FactValue>;

const show = (v: FactValue): string => (v == null ? "" : Array.isArray(v) ? v.join(", ") : String(v));
const list = (v: string): string[] => v.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
/** null for anything that is not a number — an empty or non-numeric fact must never read as 0. */
const num = (v: FactValue): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v == null || Array.isArray(v) || typeof v === "boolean") return null;
  const cleaned = String(v).trim();
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

function testRegex(actual: string, pattern: string): { matched: boolean; note?: string } {
  if (pattern.length > 200) return { matched: false, note: "pattern is too long" };
  try {
    return { matched: new RegExp(pattern, "i").test(actual) };
  } catch {
    return { matched: false, note: "invalid regular expression" };
  }
}

/** One `field op value` test against a fact. Arrays compare by membership. */
export function testCondition(c: Condition, facts: Facts): ConditionResult {
  const raw = facts[c.field];
  const base: Omit<ConditionResult, "matched" | "note"> = { field: c.field, op: c.op, value: c.value, actual: show(raw) };
  if (!(c.field in facts)) return { ...base, matched: false, note: "unknown field for this trigger" };
  const arr = Array.isArray(raw) ? raw.map((s) => s.toLowerCase()) : null;
  const text = show(raw).toLowerCase();
  const want = c.value.trim().toLowerCase();
  const decide = (matched: boolean, note?: string): ConditionResult => ({ ...base, matched, ...(note ? { note } : {}) });

  switch (c.op) {
    case "eq":
      return decide(arr ? arr.includes(want) : text === want);
    case "neq":
      return decide(arr ? !arr.includes(want) : text !== want);
    case "contains":
      return decide(arr ? arr.some((a) => a.includes(want)) : Boolean(want) && text.includes(want));
    case "matches": {
      const r = testRegex(show(raw), c.value);
      return decide(r.matched, r.note);
    }
    case "in": {
      const wanted = list(c.value);
      return decide(arr ? arr.some((a) => wanted.includes(a)) : wanted.includes(text));
    }
    case "gt":
    case "lt": {
      const a = num(raw);
      const b = num(c.value);
      if (a == null || b == null) return decide(false, "not a number");
      return decide(c.op === "gt" ? a > b : a < b);
    }
    default:
      return decide(false, "unknown operator");
  }
}

const OP_WORD: Record<Operator, string> = { eq: "=", neq: "≠", contains: "contains", matches: "matches", gt: ">", lt: "<", in: "is one of" };

const phrase = (r: ConditionResult) => `${r.field} ${OP_WORD[r.op] ?? r.op} ${JSON.stringify(r.value)}`;
const withActual = (r: ConditionResult) => `${phrase(r)} (was ${r.actual === "" ? "empty" : JSON.stringify(r.actual)}${r.note ? ` — ${r.note}` : ""})`;

/** "matched because network = "instagram" and text contains "refund"". */
export function explain(match: "all" | "any", results: ConditionResult[], matched: boolean): string {
  if (results.length === 0) return "matched — this rule has no conditions, so every event qualifies";
  const join = match === "all" ? " and " : " or ";
  if (matched) {
    const reasons = (match === "all" ? results : results.filter((r) => r.matched)).map(phrase);
    return `matched because ${reasons.join(join)}`;
  }
  const blockers = match === "all" ? results.filter((r) => !r.matched) : results;
  return `did not match: ${blockers.map(withActual).join(match === "all" ? " and " : " or ")}`;
}

/** Evaluate a whole group. `all` with no conditions matches everything. */
export function evaluateConditions(group: ConditionGroup, facts: Facts): RunEvaluation {
  const match = group.match === "any" ? "any" : "all";
  const results = (group.conditions ?? []).map((c) => testCondition(c, facts));
  const matched = results.length === 0 ? true : match === "all" ? results.every((r) => r.matched) : results.some((r) => r.matched);
  return { match, matched, results, explanation: explain(match, results, matched) };
}

export const DEFAULT_BUDGET_THRESHOLD = 80;

/**
 * Trigger-level gates that are not user conditions: the rule's channel scope
 * and, for budget rules, the percentage that must be reached before the
 * conditions are even consulted.
 */
export function triggerAllows(rule: { trigger: TriggerKind; triggerConfig: TriggerConfig }, subject: { facts: Facts; ctx: { channelId?: string } }): boolean {
  const channelIds = rule.triggerConfig.channelIds ?? [];
  if (channelIds.length && subject.ctx.channelId && !channelIds.includes(subject.ctx.channelId)) return false;
  if (rule.trigger === "campaign.budget_threshold") {
    const pct = Number(subject.facts.spend_percent ?? 0);
    if (!Number.isFinite(pct) || pct < (rule.triggerConfig.thresholdPercent ?? DEFAULT_BUDGET_THRESHOLD)) return false;
  }
  return true;
}
