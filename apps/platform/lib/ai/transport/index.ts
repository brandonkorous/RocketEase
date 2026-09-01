/*
 * Which vendor drafting runs on, decided from configuration alone.
 *
 * Precedence is deliberate: an Azure TEXT DEPLOYMENT is an explicit act of
 * configuration - Terraform writes that name only when a deployment exists - so
 * its presence is a clearer statement of intent than a key that may simply have
 * been left behind. Neither configured is a real state: every AI control hides
 * itself and every action returns AI_UNCONFIGURED.
 */
import { anthropicConfigured, anthropicTransport } from "./anthropic";
import { azureOpenAiTextConfigured, azureOpenAiTextTransport } from "./azure-openai";
import type { TextTransport } from "./types";

export type { Completion, TextTransport } from "./types";
export { anthropicBaseUrl } from "./anthropic";

/** The transport this deployment will use, or null when none is configured. */
export function activeTransport(): TextTransport | null {
  if (azureOpenAiTextConfigured()) return azureOpenAiTextTransport();
  if (anthropicConfigured()) return anthropicTransport();
  return null;
}
