/*
 * Anthropic client (M8.8). Server-only: the key is read here and never leaves.
 *
 * With ANTHROPIC_API_KEY unset every AI feature is hidden in the UI and every
 * server action returns AI_UNCONFIGURED — nothing degrades silently.
 *
 * Every metered call carries an AiUsageMeta: the hard credit cap is checked
 * before the request and the ledger row is written after it (lib/ai/usage).
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { AiUsageKind } from "@/db/schema/ai-usage";
import { log } from "@/lib/log";
import { AI_EMPTY, AI_UNAVAILABLE, AI_UNCONFIGURED, DEFAULT_AI_MODEL } from "./messages";
import type { Prompt } from "./prompts";

export { AI_EMPTY, AI_UNAVAILABLE, AI_UNCONFIGURED, DEFAULT_AI_MODEL };

export const aiConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);
export const aiModel = () => process.env.AI_MODEL || DEFAULT_AI_MODEL;

export type AiErrorCode = "budget_exceeded";
export type GenerateError = { error: string; code?: AiErrorCode };
export type GenerateResult = { text: string } | GenerateError;
/** Who a completion is billed to. Omit it only where nothing should be metered. */
export type AiUsageMeta = { organizationId: string; workspaceId: string; userId?: string | null; kind: AiUsageKind };

export const isBudgetExceeded = (res: GenerateResult) => "error" in res && res.code === "budget_exceeded";

/**
 * Where the Messages API lives. Unset means Anthropic direct; in production it
 * is our own Microsoft Foundry resource, which speaks the SAME API and accepts
 * the x-api-key header this SDK already sends. Claude either way — Foundry is a
 * different front door, not a different model.
 */
export const aiBaseUrl = () => process.env.ANTHROPIC_BASE_URL || undefined;

/**
 * Keyed on the config, not memoised blindly: a key rotated in Key Vault used to
 * need a process restart to take effect, because the first client built lived
 * for the life of the pod.
 */
let cached: { key: string; client: Anthropic } | null = null;
function client(): Anthropic {
  const key = `${process.env.ANTHROPIC_API_KEY}|${aiBaseUrl() ?? ""}`;
  if (cached?.key !== key) {
    cached = { key, client: new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, baseURL: aiBaseUrl() }) };
  }
  return cached.client;
}

/** One completion. Never throws; prompt and response text are never logged. */
export async function generate(prompt: Prompt, meta?: AiUsageMeta): Promise<GenerateResult> {
  if (!aiConfigured()) return { error: AI_UNCONFIGURED };
  if (meta) {
    const refusal = await budgetRefusal(meta.workspaceId);
    if (refusal) return refusal;
  }
  const started = Date.now();
  try {
    const res = await client().messages.create({
      model: aiModel(),
      max_tokens: prompt.maxTokens,
      system: prompt.system,
      messages: [{ role: "user", content: prompt.user }],
    });
    if (meta) await meter(meta, res);
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
    log.debug("ai completion", { model: aiModel(), ms: Date.now() - started, out: res.usage?.output_tokens });
    if (!text) return { error: AI_EMPTY };
    return { text };
  } catch (err) {
    log.warn("ai completion failed", { model: aiModel(), ms: Date.now() - started, err });
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

type Usage = { id?: string; usage?: { input_tokens?: number; output_tokens?: number } | null };

async function meter(meta: AiUsageMeta, res: Usage): Promise<void> {
  try {
    const { recordAiUsage } = await import("./usage/record");
    await recordAiUsage({ ...meta, model: aiModel(), inputTokens: res.usage?.input_tokens ?? 0, outputTokens: res.usage?.output_tokens ?? 0, requestId: res.id ?? null });
  } catch (err) {
    log.warn("ai usage not metered", { workspaceId: meta.workspaceId, kind: meta.kind, err });
  }
}
