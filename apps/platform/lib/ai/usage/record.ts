/*
 * Writing the ledger. One row per completion, no prompt or response text ever.
 * Metering must never break a draft, so a write failure is logged and swallowed
 * — the person still gets their suggestion.
 */
/*
 * No `server-only` marker, deliberately. The worker meters media generation
 * through this module (lib/media/finish.ts), and that marker throws outside a
 * Next build — the same reason lib/media/jobs.ts and normalize.ts omit it.
 * There is nothing request-scoped here; `@/db` already makes it server-side.
 */
import { db } from "@/db";
import { aiUsage, type AiUsageKind } from "@/db/schema/ai-usage";
import { log } from "@/lib/log";
import { creditsFor, creditsToColumn } from "./credits";
import { COST_DECIMALS, costUsdFor } from "./prices";

/** Who a completion is billed to. Carried from the action into `generate()`. */
export type AiUsageContext = { organizationId: string; workspaceId: string; userId?: string | null; kind: AiUsageKind };
export type AiUsageInput = AiUsageContext & {
  model: string;
  inputTokens: number;
  outputTokens: number;
  requestId?: string | null;
  /**
   * A cost the caller already knows, for models AI_PRICES_JSON does not price.
   * Media generation is billed per token at its own rates, so deriving the cost
   * here would silently record null for every image.
   */
  costUsd?: number | null;
};
export type AiUsageRecorded = { credits: number; costUsd: number | null };

const tokens = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.round(n) : 0);

export async function recordAiUsage(input: AiUsageInput): Promise<AiUsageRecorded> {
  const inputTokens = tokens(input.inputTokens);
  const outputTokens = tokens(input.outputTokens);
  const credits = creditsFor({ inputTokens, outputTokens });
  const costUsd = input.costUsd === undefined ? costUsdFor(input.model, { inputTokens, outputTokens }) : input.costUsd;
  try {
    await db.insert(aiUsage).values({
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      userId: input.userId ?? null,
      kind: input.kind,
      model: input.model,
      inputTokens,
      outputTokens,
      credits: creditsToColumn(credits),
      costUsd: costUsd === null ? null : costUsd.toFixed(COST_DECIMALS),
      requestId: input.requestId ?? null,
    });
  } catch (err) {
    log.warn("ai usage not recorded", { workspaceId: input.workspaceId, kind: input.kind, err });
  }
  return { credits, costUsd };
}
