/*
 * One model call that must come back as JSON. Retries exactly once with a
 * blunter instruction; after that the caller reports the channel as failed
 * rather than inventing a fallback concept.
 */
import type { Prompt } from "../prompts";
import { parseObjectArray } from "./parse";
import { repairPrompt } from "./prompts";

export type Generator = (prompt: Prompt) => Promise<{ text: string } | { error: string }>;

export type AskResult = { items: Record<string, unknown>[] } | { error: string };

export const UNPARSEABLE = "The model didn't return usable JSON. Try again.";

/** `key` is the wrapper property to accept, e.g. "concepts" or "variants". */
export async function askJson(gen: Generator, prompt: Prompt, key: string): Promise<AskResult> {
  const first = await gen(prompt);
  if ("error" in first) return { error: first.error };
  const parsed = parseObjectArray(first.text, key);
  if (parsed) return { items: parsed };

  const second = await gen(repairPrompt(prompt));
  if ("error" in second) return { error: second.error };
  const retried = parseObjectArray(second.text, key);
  return retried ? { items: retried } : { error: UNPARSEABLE };
}
