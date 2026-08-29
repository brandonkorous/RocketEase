/*
 * Writing the ledger. One row per completion, no prompt or response text ever.
 * Metering must never break a draft, so a write failure is logged and swallowed
 * — the person still gets their suggestion.
 */
import "server-only";
import { db } from "@/db";
import { aiUsage, type AiUsageKind } from "@/db/schema/ai-usage";
import { log } from "@/lib/log";
import { creditsFor, creditsToColumn } from "./credits";
import { COST_DECIMALS, costUsdFor } from "./prices";

/** Who a completion is billed to. Carried from the action into `generate()`. */
export type AiUsageContext = { organizationId: string; workspaceId: string; userId?: string | null; kind: AiUsageKind };
export type AiUsageInput = AiUsageContext & { model: string; inputTokens: number; outputTokens: number; requestId?: string | null };
export type AiUsageRecorded = { credits: number; costUsd: number | null };

const tokens = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.round(n) : 0);

export async function recordAiUsage(input: AiUsageInput): Promise<AiUsageRecorded> {
  const inputTokens = tokens(input.inputTokens);
  const outputTokens = tokens(input.outputTokens);
  const credits = creditsFor({ inputTokens, outputTokens });
  const costUsd = costUsdFor(input.model, { inputTokens, outputTokens });
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
