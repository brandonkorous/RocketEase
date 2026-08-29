/*
 * Anthropic client (M8.8). Server-only: the key is read here and never leaves.
 *
 * With ANTHROPIC_API_KEY unset every AI feature is hidden in the UI and every
 * server action returns AI_UNCONFIGURED — nothing degrades silently.
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { log } from "@/lib/log";
import { AI_EMPTY, AI_UNAVAILABLE, AI_UNCONFIGURED, DEFAULT_AI_MODEL } from "./messages";
import type { Prompt } from "./prompts";

export { AI_EMPTY, AI_UNAVAILABLE, AI_UNCONFIGURED, DEFAULT_AI_MODEL };

export const aiConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);
export const aiModel = () => process.env.AI_MODEL || DEFAULT_AI_MODEL;

export type GenerateResult = { text: string } | { error: string };

let cached: Anthropic | null = null;
function client(): Anthropic {
  cached ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return cached;
}

/** One completion. Never throws; prompt and response text are never logged. */
export async function generate(prompt: Prompt): Promise<GenerateResult> {
  if (!aiConfigured()) return { error: AI_UNCONFIGURED };
  const started = Date.now();
  try {
    const res = await client().messages.create({
      model: aiModel(),
      max_tokens: prompt.maxTokens,
      system: prompt.system,
      messages: [{ role: "user", content: prompt.user }],
    });
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
    log.debug("ai completion", { model: aiModel(), ms: Date.now() - started, out: res.usage?.output_tokens });
    if (!text) return { error: AI_EMPTY };
    return { text };
  } catch (err) {
    log.warn("ai completion failed", { model: aiModel(), ms: Date.now() - started, err });
    return { error: AI_UNAVAILABLE };
  }
}
