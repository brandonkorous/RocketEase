/*
 * AI drafting (M8.8). Server-only: the key is read here and never leaves.
 *
 * This file owns POLICY - configured or not, budget, metering, and the fact
 * that nothing here ever throws. WHICH VENDOR answers is not policy, and lives
 * in ./transport: with no transport configured every AI feature is hidden in
 * the UI and every server action returns AI_UNCONFIGURED, so nothing degrades
 * silently.
 *
 * Every metered call carries an AiUsageMeta: the hard credit cap is checked
 * before the request and the ledger row is written after it (lib/ai/usage).
 */
import "server-only";
import { log } from "@/lib/log";
import type { AiUsageKind } from "@/db/schema/ai-usage";
import { AI_EMPTY, AI_UNAVAILABLE, AI_UNCONFIGURED, DEFAULT_AI_MODEL } from "./messages";
import type { Prompt } from "./prompts";
import { activeTransport, type Completion } from "./transport";

export { AI_EMPTY, AI_UNAVAILABLE, AI_UNCONFIGURED, DEFAULT_AI_MODEL };
export { anthropicBaseUrl as aiBaseUrl } from "./transport";

export const aiConfigured = () => activeTransport() !== null;

/** What the ledger records. A DEPLOYMENT name on Azure, a model id on Anthropic. */
export const aiModel = () => activeTransport()?.model() ?? DEFAULT_AI_MODEL;

/** Which vendor is answering, for logs and support questions. */
export const aiVendor = () => activeTransport()?.name ?? null;

export type AiErrorCode = "budget_exceeded";
export type GenerateError = { error: string; code?: AiErrorCode };
export type GenerateResult = { text: string } | GenerateError;
/** Who a completion is billed to. Omit it only where nothing should be metered. */
export type AiUsageMeta = { organizationId: string; workspaceId: string; userId?: string | null; kind: AiUsageKind };

export const isBudgetExceeded = (res: GenerateResult) => "error" in res && res.code === "budget_exceeded";

/** One completion. Never throws; prompt and response text are never logged. */
export async function generate(prompt: Prompt, meta?: AiUsageMeta): Promise<GenerateResult> {
  const transport = activeTransport();
  if (!transport) return { error: AI_UNCONFIGURED };
  if (meta) {
    const refusal = await budgetRefusal(meta.workspaceId);
    if (refusal) return refusal;
  }
  const started = Date.now();
  try {
    const res = await transport.complete(prompt);
    if (meta) await meter(meta, res);
    log.debug("ai completion", { vendor: transport.name, model: transport.model(), ms: Date.now() - started, out: res.outputTokens });
    if (!res.text) return { error: AI_EMPTY };
    return { text: res.text };
  } catch (err) {
    log.warn("ai completion failed", { vendor: transport.name, model: transport.model(), ms: Date.now() - started, err });
    return { error: AI_UNAVAILABLE };
  }
}

/** A generator bound to one workspace and purpose, for drafts.ts and the generator. */
export const aiGenerator = (meta: AiUsageMeta) => (prompt: Prompt) => generate(prompt, meta);

/*
 * The usage modules reach the database, so they are imported lazily: modules
 * that only build prompts stay DB-free, and so do their tests.
 */
async function budgetRefusal(workspaceId: string): Promise<GenerateError | null> {
  try {
    const { aiCapMessage, checkAiBudget } = await import("./usage/meter");
    const budget = await checkAiBudget(workspaceId);
    if (budget.allowed) return null;
    return { error: aiCapMessage(budget.resetsAt, budget.timezone), code: "budget_exceeded" };
  } catch (err) {
    // The caller already read this workspace from the same database; a failure
    // here is infrastructural, and blocking drafting would not save any spend.
    log.warn("ai budget check failed", { workspaceId, err });
    return null;
  }
}

async function meter(meta: AiUsageMeta, res: Completion): Promise<void> {
  try {
    const { recordAiUsage } = await import("./usage/record");
    await recordAiUsage({ ...meta, model: aiModel(), inputTokens: res.inputTokens, outputTokens: res.outputTokens, requestId: res.requestId });
  } catch (err) {
    log.warn("ai usage not metered", { workspaceId: meta.workspaceId, kind: meta.kind, err });
  }
}
