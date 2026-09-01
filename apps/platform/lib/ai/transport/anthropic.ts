/*
 * Claude, direct or through Microsoft Foundry.
 *
 * Foundry speaks the SAME Messages API and accepts the x-api-key header this
 * SDK already sends, so the base URL is the only difference between them. Not
 * currently the configured transport - see the Foundry section of
 * terraform/envs/azure/rocketease.tf in sparx.works for why - but kept whole,
 * because that is the point of having a seam.
 */
import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_AI_MODEL } from "../messages";
import type { Prompt } from "../prompts";
import type { Completion, TextTransport } from "./types";

export const anthropicConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);

/** Unset means Anthropic direct; set, it is our own Foundry resource. */
export const anthropicBaseUrl = () => process.env.ANTHROPIC_BASE_URL || undefined;

const model = () => process.env.AI_MODEL || DEFAULT_AI_MODEL;

/**
 * Keyed on the config, not memoised blindly: a key rotated in Key Vault used to
 * need a process restart to take effect, because the first client built lived
 * for the life of the pod.
 */
let cached: { key: string; client: Anthropic } | null = null;
function client(): Anthropic {
  const key = `${process.env.ANTHROPIC_API_KEY}|${anthropicBaseUrl() ?? ""}`;
  if (cached?.key !== key) {
    cached = { key, client: new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, baseURL: anthropicBaseUrl() }) };
  }
  return cached.client;
}

export const anthropicTransport = (): TextTransport => ({
  name: "anthropic",
  model,
  async complete(prompt: Prompt): Promise<Completion> {
    const res = await client().messages.create({
      model: model(),
      max_tokens: prompt.maxTokens,
      system: prompt.system,
      messages: [{ role: "user", content: prompt.user }],
    });
    return {
      text: res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim(),
      inputTokens: res.usage?.input_tokens ?? 0,
      outputTokens: res.usage?.output_tokens ?? 0,
      requestId: res.id ?? null,
    };
  },
});
