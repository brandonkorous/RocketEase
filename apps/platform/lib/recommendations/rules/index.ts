import type { RecommendationDraft, Rule, WorkspaceFacts } from "../types";
import { audienceGrowthRule } from "./audience-growth";
import { cadenceGapRule } from "./cadence";
import { decliningTrendRule } from "./trend";
import { formatPerformanceRule } from "./format-performance";
import { inboxResponseLoadRule } from "./inbox-load";
import { reuseCandidateRule } from "./reuse";

/** Every rule is a pure function over facts; order here is the display order. */
export const RULES: Rule[] = [decliningTrendRule, cadenceGapRule, formatPerformanceRule, reuseCandidateRule, audienceGrowthRule, inboxResponseLoadRule];

const RANK = { high: 0, medium: 1, low: 2 } as const;

/** Run every rule and sort so the most confident, most actionable land first. */
export function runRules(facts: WorkspaceFacts): RecommendationDraft[] {
  const drafts = RULES.flatMap((rule) => rule(facts));
  return drafts.sort((a, b) => RANK[a.confidence] - RANK[b.confidence]);
}

export { audienceGrowthRule, cadenceGapRule, decliningTrendRule, formatPerformanceRule, inboxResponseLoadRule, reuseCandidateRule };
